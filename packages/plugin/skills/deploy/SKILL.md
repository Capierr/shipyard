---
description: Deploys the current app to App Store and Google Play. Detects project type, wraps web apps in Capacitor, builds iOS and Android binaries, captures screenshots, generates AI store metadata, uploads everything, and submits for review — all automatically. Triggers when the user says "deploy my app", "ship it", "publish to the stores", "release this app", "submit to app store", "submit to play store", or "push to production".
argument-hint: "[--platform ios|android|all] [--skip wrap,capture] [--resume]"
allowed-tools: Bash, Read, Write
---

# Deploy

Runs the full Shipyard pipeline for the current project. Reads `.shipyard/config.yml`, calls `shipyard deploy --json`, streams progress, and reports results.

## Steps

1. Verify `.shipyard/config.yml` exists. If missing, tell the user to run `/setup` first.
2. Check `.shipyard/state.json` for a previous failed run — if found, ask the user whether to resume or start fresh.
3. Build the command: `shipyard deploy --json --non-interactive` plus any flags from arguments.
4. Run the command and stream events line by line. For each event, print a one-line status update.
5. On `pipeline_complete`: show a summary table of all stages with durations, then show the submission IDs and store links.
6. On `pipeline_failed`:
   - If `class: retriable` → offer to resume: "Run `/deploy --resume` to retry from the failed stage."
   - If `class: fixable` → describe the fix and offer to apply it, then re-run.
   - If `class: credential` → tell the user to run `/setup --repair`.
   - If `class: hard-stop` → show the exact manual action required with the relevant URL.

## Flags

Pass flags through directly to the CLI:
- `--platform ios|android|all`
- `--resume` (continues from last failed stage)
- `--skip wrap,capture` (skips specific stages)
- `--from capture` (starts from a specific stage)

## Notes

- Never ask the user questions during the run — all decisions are made from `config.yml`.
- If `config.yml` is missing a required field, fail fast with a clear message pointing to the field.
- Upload and submit run in parallel for both stores — report both results together.
