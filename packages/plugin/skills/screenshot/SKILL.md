---
description: Captures and composes store screenshots for the current app. Runs fastlane snapshot (iOS) and screengrab (Android), then frames them with device mockups and AI-generated captions using appshot-cli. Triggers when the user says "generate screenshots", "take store screenshots", "create app store screenshots", "make screenshots for the app store", or "update my store screenshots".
argument-hint: "[--platform ios|android|all]"
allowed-tools: Bash, Read
---

# Screenshot

Runs only the `capture` and `compose` stages of the Shipyard pipeline.

## Steps

1. Run `shipyard screenshot --json --platform <platform>`.
2. Stream events and print progress.
3. On completion, list the generated screenshot files from `.shipyard/screenshots/`.
4. Tell the user: "Screenshots are ready. Run `/publish` to upload them to the stores, or `/deploy` to run the full pipeline."

## Notes

- iOS screenshots require a macOS machine with Xcode simulators installed.
- Android screenshots can run on macOS or Linux.
- The compose stage uses appshot-cli with the device list and frame style from `config.yml`.
- AI captions are generated per screen per locale using Claude Haiku.
