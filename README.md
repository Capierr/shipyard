# Shipyard

> From source code to App Store + Google Play — fully automated, zero interaction.

Shipyard is a two-layer system that takes your existing app (web, React Native, Expo, Flutter, or native) and publishes it to both stores without touching a browser or dashboard after the one-time setup.

## Architecture

```
Intelligence Layer  →  Claude Code Plugin  (/deploy, /publish, /screenshot)
Execution Layer     →  @shipyard-app/cli   (deterministic, CI-safe pipeline)
```

## Pipeline

```
detect → wrap → build → capture → compose → ai-meta → upload → submit
```

| Stage | What happens |
|-------|-------------|
| detect | Reads your project and builds a `ProjectProfile` |
| wrap | Wraps web apps in Capacitor (skipped for native apps) |
| build | Compiles iOS + Android via EAS Build (falls back to Fastlane) |
| capture | Screenshots every screen on every device size + locale |
| compose | Frames screenshots with device mockups + AI-generated captions |
| ai-meta | Claude generates title, description, keywords, release notes — all locales |
| upload | Uploads binary + metadata + screenshots to both stores in parallel |
| submit | Submits for App Store review + promotes to configured Play Store track |

## Quick Start

```bash
# Install
npm install -g @shipyard-app/cli

# One-time credential setup
shipyard setup

# Deploy
shipyard deploy
```

## Claude Code Plugin

Install the `shipyard` plugin in Claude Code, then:

```
/deploy          → full pipeline
/screenshot      → capture + compose + preview
/publish         → upload + submit only
/setup           → credential wizard
/status          → live review status
```

## Requirements

- Node.js ≥ 20
- Ruby + Bundler ≥ 3.2 (for Fastlane)
- macOS (required for iOS screenshot capture via simulators)
- Apple Developer Program membership ($99/year)
- Google Play Developer account ($25 one-time)

See [docs/superpowers/specs/](docs/superpowers/specs/) for the full design spec.

## One-Time Manual Steps

Before the pipeline can run fully automatically, each new app needs:

1. App record created in App Store Connect
2. First APK/AAB uploaded manually to Play Console (Google API limitation)
3. App moved out of Draft status in Play Console
4. Credentials configured via `shipyard setup`

Everything after that is fully automated on every release.

## License

MIT
