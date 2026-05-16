---
description: Runs the one-time credential and configuration wizard for Shipyard. Guides through Apple .p8 key setup, Google Service Account key, EAS token, Android keystore, and creates .shipyard/config.yml. Triggers when the user says "set up shipyard", "configure shipyard", "add my credentials", "shipyard setup", or "initialise shipyard for this project".
argument-hint: "[--repair]"
allowed-tools: Bash, Read, Write
---

# Setup

Guides the user through the one-time credential setup for Shipyard.

## Steps

1. Check if `.shipyard/config.yml` exists. If yes (and `--repair` not passed), ask: "Config already exists. Do you want to (a) update it, (b) repair only broken credentials, or (c) start fresh?"
2. Run `shipyard setup` (or `shipyard setup --repair`).
3. If the user needs to generate credentials they don't have yet, provide these links:
   - Apple .p8 key: https://appstoreconnect.apple.com/access/integrations/api
   - Google Service Account: https://console.cloud.google.com/iam-admin/serviceaccounts
   - EAS token: https://expo.dev/settings/access-tokens
4. After setup completes, confirm all credentials are stored and show a checklist of what was configured.
5. Remind the user of the one-time manual steps (first Play Store upload, etc.) if this is a new app.

## Notes

- Never log credentials to the terminal.
- Credentials are stored in the backend configured in `config.yml` (env | keychain | 1password) — never written to disk as plaintext.
- The `.shipyard/` directory is added to `.gitignore` automatically.
