# Shipyard — Automated App Store Deployment Pipeline
**Design Spec · 2026-05-16**

---

## 1. Problem Statement

Publishing a mobile app to the App Store and Google Play involves 10+ manual steps across multiple tools, accounts, and dashboards. Each release requires: building signed binaries, capturing screenshots across dozens of device sizes, writing localised store copy, uploading everything, and submitting for review. This spec describes **Shipyard** — a system that fully automates this workflow from source code to store submission, with AI generating all store content.

---

## 2. Scope & Goals

**In scope:**
- Web apps (React, Vue, Svelte, Angular, vanilla) wrapped into native iOS + Android via Capacitor
- React Native / Expo apps (native mobile already)
- Flutter and native iOS/Android projects (build + publish only)
- Fully automated: build → sign → screenshot → AI content → upload → submit
- Zero human interaction after one-time credential setup per project

**Out of scope:**
- Building apps from scratch (Shipyard deploys existing codebases)
- Managing in-app purchases or subscriptions
- Responding to review rejections (flagged for human action; future iteration)
- Enterprise / in-house distribution

**Hard limits that will always require human action (platform policy):**
1. Apple Developer Program enrollment ($99/year) and agreement acceptance
2. Google Play Developer account registration ($25) and agreement acceptance
3. First binary upload to Google Play Console (API cannot create a new listing)
4. Moving a Play Store app out of Draft status
5. Play App Signing Terms of Service enrollment
6. App Store review result (human review, cannot be automated)
7. iOS screenshot capture requires a macOS machine (Apple policy — iOS simulators only run on macOS). Android screenshot capture can run on Linux or macOS.

---

## 3. System Architecture

Shipyard is a two-layer system: a deterministic **Execution Layer** (CLI) and an intelligent **Intelligence Layer** (Claude Code plugin). The CLI is fully usable without the plugin in CI/CD pipelines.

```
┌────────────────────────────────────────────────────────┐
│                  INTELLIGENCE LAYER                    │
│              (Claude Code Plugin: shipyard)            │
│                                                        │
│  Skills:  /deploy  /screenshot  /publish  /setup       │
│           /status                                      │
│  Agents:  deployment-pilot                             │
│           rejection-handler                            │
│           metadata-generator                           │
│  Hooks:   PostToolUse → auto-trigger on main push      │
└──────────────────────┬─────────────────────────────────┘
                       │ calls
┌──────────────────────▼─────────────────────────────────┐
│                  EXECUTION LAYER                       │
│              (@shipyard-app/cli — npm package)         │
│                                                        │
│  Pipeline Engine → Stage Runner → Adapter System       │
│  State machine · resume · JSON event stream · CI-safe  │
└────────────────────────────────────────────────────────┘
```

---

## 4. CLI Pipeline Engine

### 4.1 Stages

The pipeline runs eight sequential stages. Each stage is implemented as one or more **adapters** — the engine selects the first adapter whose `canHandle()` returns true.

| # | Stage | Primary Adapter | Fallback Adapter |
|---|-------|----------------|-----------------|
| 1 | `detect` | `ProjectDetector` | — |
| 2 | `wrap` | `CapacitorAdapter` | `ExpoAdapter` |
| 3 | `build` | `EASBuildAdapter` | `FastlaneBuildAdapter` |
| 4 | `capture` | `SnapshotAdapter` (iOS) + `ScreengrabAdapter` (Android) | — |
| 5 | `compose` | `AppShotAdapter` | — |
| 6 | `ai_meta` | `ClaudeMetadataAdapter` | — |
| 7 | `upload` | `FastlaneDeliverAdapter` (iOS) + `FastlaneSupplyAdapter` (Android) | — |
| 8 | `submit` | `AppStoreSubmitAdapter` + `PlayStoreSubmitAdapter` | — |

### 4.2 Adapter Interface

```typescript
interface StageAdapter<TInput, TOutput> {
  name: string
  canHandle(ctx: ProjectProfile): boolean
  run(input: TInput, ctx: PipelineContext): Promise<TOutput>
  rollback?(ctx: PipelineContext): Promise<void>
}
```

### 4.3 Stage Descriptions

**DETECT** — Scans the project filesystem to produce a `ProjectProfile`:
- Reads `package.json`, `capacitor.config.ts`, `pubspec.yaml`, `build.gradle`, `Info.plist`, `app.json`
- Determines: app type, entry point, bundle ID / package name, locale list, whether native modules exist
- Native module detection triggers `has_native_modules: true` → forces `FastlaneBuildAdapter`

**WRAP** — Converts web apps into native containers:
- Capacitor: `cap init && cap add ios && cap add android && cap sync`
- Expo: `expo prebuild`
- Skipped entirely if project is already native (React Native, Flutter, native iOS/Android)
- `entry_point` from config tells Capacitor where the web build output lives
- **Prerequisite:** the web app must have a production build present in `entry_point` before this stage runs. Shipyard does not build the web app — run `npm run build` (or equivalent) first. The `shipyard deploy` command checks for this and fails fast with a clear message if the directory is missing or empty.

**BUILD** — Compiles signed iOS and Android binaries:
- EAS Build: `eas build --platform all --non-interactive --profile production`
- Fallback (native modules detected, or EAS unavailable): `fastlane gym` (iOS) + `fastlane gradle` (Android)
- Outputs: `.ipa` (iOS) and `.aab` (Android) artifact paths written to state

**CAPTURE** — Captures screenshots in every configured device/locale combination:
- iOS: `fastlane snapshot` via XCUITest — runs all simulators concurrently (requires macOS runner)
- Android: `fastlane screengrab` via Espresso — runs on Linux or macOS
- Output: `fastlane/screenshots/{locale}/{DeviceName}/*.png`

**COMPOSE** — Frames raw screenshots into marketing assets:
- `appshot-cli --no-interactive --devices {list} --template {frame_style} --langs {locales}`
- Claude haiku generates and localises screenshot captions (one LLM call per locale, parallel)
- Captions injected into `Framefile.json` before compositing runs
- Output: `.shipyard/screenshots/{locale}/{device}/*.png` (all store-required sizes)

**AI-META** — Generates all store listing copy:
- The `ClaudeMetadataAdapter` (CLI) calls the Anthropic API directly using `ANTHROPIC_API_KEY`
- Inside the Claude Code plugin, the `metadata-generator` agent calls `shipyard ai-meta --json` which triggers the same adapter — the plugin does not bypass the CLI
- Claude sonnet-4-6 reads README, package.json, source entry points, existing store listing
- Generates primary locale: `name`, `subtitle`, `description`, `keywords`, `promotional_text`, `release_notes` (iOS) and `short_description`, `full_description`, `changelogs` (Android)
- Claude haiku-4-5 localises into all remaining locales in parallel (`Promise.all`)
- Output written to fastlane-compatible directory tree (see §6.2)

**UPLOAD** — Uploads binary, metadata, and screenshots to both stores simultaneously:
- iOS: `fastlane deliver` (metadata + screenshots + binary, submits to TestFlight)
- Android: `fastlane supply` (metadata + screenshots + AAB, assigns to configured track)
- Both run in parallel via `Promise.all`

**SUBMIT** — Submits apps for review:
- iOS: App Store Connect API — creates review submission, adds version, submits
- Android: Google Play Developer API — promotes build to configured track (internal → production)

### 4.4 State Machine & Resume

Every stage writes its result to `.shipyard/state.json`. On failure, the pipeline halts and records the error. `shipyard deploy --resume` replays from the failed stage, skipping all `completed` stages.

```json
{
  "runId": "2026-05-16-001",
  "stages": {
    "detect":  { "status": "completed", "output": { "type": "web-react" } },
    "wrap":    { "status": "completed" },
    "build":   { "status": "failed", "error": "EAS build abc-123 failed: missing EXPO_TOKEN" },
    "capture": { "status": "pending" }
  }
}
```

### 4.5 CLI Interface

```bash
# Full pipeline
shipyard deploy
shipyard deploy --non-interactive        # CI mode — fails on any missing input
shipyard deploy --resume                 # continue from last failed stage
shipyard deploy --from=capture           # restart from a specific stage
shipyard deploy --skip=wrap,capture      # skip specific stages
shipyard deploy --platform ios           # single platform
shipyard deploy --json                   # newline-delimited JSON event stream

# Individual stage groups
shipyard screenshot                      # capture + compose only
shipyard publish                         # upload + submit (existing artifacts)
shipyard setup                           # one-time credential wizard
shipyard status                          # live review status from store APIs
```

### 4.6 JSON Event Stream

The CLI emits newline-delimited JSON to stdout when `--json` is passed. The plugin consumes this stream for live progress and error handling:

```json
{"event":"stage_start","stage":"build","ts":"2026-05-16T10:00:00Z"}
{"event":"log","stage":"build","level":"info","msg":"EAS build queued: abc-123"}
{"event":"stage_complete","stage":"build","duration_ms":187000}
{"event":"ai_generating","stage":"ai_meta","locale":"en-US","model":"claude-sonnet-4-6"}
{"event":"ai_generating","stage":"ai_meta","locale":"pt-BR","model":"claude-haiku-4-5"}
{"event":"stage_complete","stage":"ai_meta","locales_generated":4}
{"event":"pipeline_complete","total_duration_ms":420000,"submission_ids":{"ios":"sub-xyz","android":"prod-123"}}
{"event":"pipeline_failed","stage":"build","error":"...","class":"retriable"}
```

---

## 5. Claude Code Plugin

### 5.1 Plugin Structure

```
shipyard/
├── plugin.json
├── skills/
│   ├── deploy/SKILL.md
│   ├── screenshot/SKILL.md
│   ├── publish/SKILL.md
│   ├── setup/SKILL.md
│   └── status/SKILL.md
├── agents/
│   ├── deployment-pilot.md
│   ├── rejection-handler.md
│   └── metadata-generator.md
└── hooks/
    └── hooks.json
```

### 5.2 Skills

| Skill | Trigger phrases | What Claude does |
|-------|----------------|-----------------|
| `/deploy` | "deploy my app", "publish to stores", "ship it" | Detects project, calls `shipyard deploy --json`, streams progress, interprets result |
| `/screenshot` | "generate screenshots", "take store screenshots" | Runs capture + compose, previews result, allows regeneration before upload |
| `/publish` | "upload to app store", "submit for review" | Upload + submit only; assumes build artifacts exist |
| `/setup` | "set up shipyard", "configure credentials" | Interactive credential wizard for Apple .p8, Google SA key, EAS token |
| `/status` | "check review status", "where is my app" | Reads state.json + queries store APIs, shows live review state |

### 5.3 Agents

**`deployment-pilot`**
- When to trigger: on `/deploy`, or automatically when `auto_deploy: true` and push to main is detected
- Reads `ProjectProfile` from detect stage output
- Decides which adapters to activate based on project type
- Calls `shipyard deploy --non-interactive --json` and streams events to Claude Code terminal
- On `pipeline_failed` event with class `retriable`: waits and retries
- On `pipeline_failed` with class `fixable`: invokes `rejection-handler`
- On `pipeline_failed` with class `hard-stop`: surfaces clear human instruction with relevant URL

**`rejection-handler`**
- When to trigger: called by `deployment-pilot` on fixable failures, or manually via `/status` when review is rejected
- Reads rejection reason from App Store Connect API or Play Console (via Google Play API)
- Cross-references against Apple App Review Guidelines and Google Play Policy
- Proposes a specific, actionable fix (code change, metadata edit, or screenshot replacement)
- Presents fix to user, waits for approval, then re-runs `/publish`

**`metadata-generator`**
- When to trigger: called by `deployment-pilot` during `ai_meta` stage, or standalone
- Full context assembly: README → package.json → source entry points → existing listing
- Generates primary locale with claude-sonnet-4-6 (structured JSON output with field-length enforcement)
- Localises into all configured locales with claude-haiku-4-5 (parallel calls)
- Writes fastlane-compatible metadata directory tree to `.shipyard/metadata/`

### 5.4 Hooks

```json
{
  "hooks": [
    {
      "event": "PostToolUse",
      "matcher": { "tool": "Bash", "pattern": "git push.*main" },
      "type": "prompt",
      "prompt": "The user pushed to main. Check .shipyard/config.yml. If auto_deploy is true, invoke the deployment-pilot agent silently."
    }
  ]
}
```

Auto-deploy is opt-in (`auto_deploy: false` by default).

---

## 6. Configuration

### 6.1 Project Config (`.shipyard/config.yml`)

Committed to git. Contains no secrets.

```yaml
app:
  name: "My App"
  bundle_id: "com.example.myapp"
  package_name: "com.example.myapp"
  locales: [en-US, pt-BR, es-ES, fr-FR]

build:
  strategy: eas          # eas | fastlane | auto
  fallback: fastlane
  profile: production

wrap:
  strategy: capacitor    # capacitor | expo | none
  entry_point: dist/

metadata:
  tone: professional     # professional | playful | technical | minimal
  keywords_count: 10
  auto_generate: true

screenshots:
  devices: [iphone-16-pro, iphone-se, ipad-pro-13, pixel-9, samsung-s24]
  frame_style: minimal   # minimal | branded | gradient
  caption_style: feature-highlight

deploy:
  auto_deploy: false
  track_android: internal
  track_ios: testflight

credentials:
  storage: env           # env | keychain | 1password
```

### 6.2 Metadata Output Structure

Fastlane-compatible. Used directly by `deliver` (iOS) and `supply` (Android).

```
.shipyard/metadata/
├── ios/
│   └── {locale}/
│       ├── name.txt                (max 30 chars)
│       ├── subtitle.txt            (max 30 chars)
│       ├── description.txt         (max 4000 chars)
│       ├── keywords.txt            (max 100 chars, comma-separated)
│       ├── promotional_text.txt    (max 170 chars)
│       └── release_notes.txt       (max 4000 chars)
└── android/
    └── {locale}/
        ├── short_description.txt   (max 80 chars)
        ├── full_description.txt    (max 4000 chars)
        └── changelogs/default.txt
```

---

## 7. Credential Management

### 7.1 Required Secrets

```
# Apple / iOS
SHIPYARD_ASC_KEY_ID           App Store Connect API key ID
SHIPYARD_ASC_ISSUER_ID        App Store Connect issuer ID
SHIPYARD_ASC_KEY_PATH         Absolute path to .p8 private key file
SHIPYARD_APPLE_TEAM_ID        10-character Apple team ID

# Google / Android
SHIPYARD_GOOGLE_SA_KEY        Full JSON content of Google Service Account key
SHIPYARD_ANDROID_KEYSTORE     Base64-encoded .jks / .keystore file
SHIPYARD_ANDROID_KEY_ALIAS    Keystore key alias
SHIPYARD_ANDROID_KEY_PASS     Key password
SHIPYARD_ANDROID_STORE_PASS   Keystore password

# EAS (builds)
EXPO_TOKEN                    Expo personal access token

# Claude (standalone CLI only — plugin uses session key)
ANTHROPIC_API_KEY
```

### 7.2 Storage Backends

| Backend | Mechanism | Best for |
|---------|-----------|----------|
| `env` | Shell environment / CI secrets manager | GitHub Actions, Bitrise, any CI |
| `keychain` | macOS Keychain via `security` CLI | Local development on Mac |
| `1password` | `op run --` prefix injection | Teams using 1Password |

`shipyard setup` detects the configured backend and writes credentials to the correct store — never to disk as plaintext. The `.shipyard/` directory is added to `.gitignore` by `shipyard setup`.

---

## 8. Error Handling

| Class | Examples | Strategy |
|-------|----------|----------|
| `retriable` | EAS timeout, upload network error | Auto-retry ×3, exponential backoff |
| `fixable` | Metadata over character limit, missing screenshot size, wrong build config | `rejection-handler` proposes exact fix, re-runs failed stage only |
| `credential` | Expired .p8 key, revoked service account | `shipyard setup --repair` re-collects the specific broken credential |
| `hard-stop` | First Play upload not done, store human rejection | Clear human instruction + relevant URL; pipeline halts |

All errors are written to `.shipyard/state.json` with full context. The CLI exit code maps to error class: `0` success, `1` retriable/fixable (resume possible), `2` credential error, `3` hard stop.

---

## 9. Tool Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 20 | CLI runtime |
| Ruby + Bundler | ≥ 3.2 | Fastlane runtime |
| Fastlane | ≥ 2.220 | deliver, supply, snapshot, screengrab, frameit, gym, match |
| EAS CLI | ≥ 10.0 | Cloud builds + submission |
| Capacitor CLI | ≥ 6.0 | Web-to-native wrapping |
| appshot-cli | latest | Screenshot framing + caption compositing |
| Transporter CLI | latest | iOS binary upload (Apple-provided) |
| Xcode | ≥ 16 | Required for iOS snapshot capture (macOS only) |
| Android Studio / SDK | API 34+ | Required for screengrab |

---

## 10. Implementation Phases

| Phase | Deliverable | Stages covered |
|-------|-------------|----------------|
| 1 | Core pipeline engine + adapter interface + state machine | Architecture only |
| 2 | ProjectDetector + CapacitorAdapter + EASBuildAdapter + FastlaneBuildAdapter | detect, wrap, build |
| 3 | SnapshotAdapter + ScreengrabAdapter + AppShotAdapter | capture, compose |
| 4 | ClaudeMetadataAdapter (primary locale) | ai_meta (partial) |
| 5 | ClaudeMetadataAdapter localization + metadata output writer | ai_meta (complete) |
| 6 | FastlaneDeliverAdapter + FastlaneSupplyAdapter | upload |
| 7 | AppStoreSubmitAdapter + PlayStoreSubmitAdapter | submit |
| 8 | Credential management (`shipyard setup`) | cross-cutting |
| 9 | JSON event stream + error classification + resume | cross-cutting |
| 10 | Claude Code plugin: skills + agents + hooks | Intelligence Layer |

---

## 11. One-Time Setup Checklist (per app)

Before the pipeline can run fully automatically, these human steps must be completed once:

- [ ] Apple Developer Program account active, agreements accepted
- [ ] App record created in App Store Connect
- [ ] App Store Connect API key generated (download `.p8`, note Key ID + Issuer ID)
- [ ] Google Play Developer account active, agreements accepted
- [ ] App created in Play Console (package name registered)
- [ ] First APK/AAB uploaded manually via Play Console → app moved out of Draft
- [ ] Play App Signing enrolled
- [ ] Google Cloud project created, Play Developer API enabled
- [ ] Service Account created with "Release Manager" role in Play Console
- [ ] Service Account JSON key downloaded
- [ ] Android keystore generated and stored securely
- [ ] `shipyard setup` run (stores all credentials in configured backend)

After this checklist: every future release is fully automated.
