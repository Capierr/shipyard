---
description: Uploads existing build artifacts, screenshots, and metadata to App Store and Google Play, then submits for review. Skips the build and screenshot stages — use this when you already have a built binary. Triggers when the user says "upload to app store", "submit for review", "publish the build", "upload my app", or "push to stores".
argument-hint: "[--platform ios|android|all]"
allowed-tools: Bash, Read
---

# Publish

Runs only the `upload` and `submit` stages. Expects build artifacts to exist at `.shipyard/artifacts/`.

## Steps

1. Verify `.shipyard/artifacts/` exists and contains an `.ipa` and/or `.aab`. If not, tell the user to run `/deploy` first or `/deploy --from=build`.
2. Run `shipyard publish --json --platform <platform>`.
3. Stream events and print progress.
4. On completion, show the submission IDs and links to App Store Connect / Play Console.

## Notes

- Upload runs in parallel for both stores.
- Use `/deploy --skip=wrap,build,capture,compose,ai_meta` for a faster path that still regenerates metadata.
