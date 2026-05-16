---
description: Shows the live deployment status for the current project — pipeline stage results, build status from EAS, and review status from App Store Connect and Google Play. Triggers when the user says "check status", "where is my app", "is my app approved", "deployment status", "review status", or "what happened with my deploy".
argument-hint: ""
allowed-tools: Bash, Read
---

# Status

Shows current pipeline and store review status.

## Steps

1. Run `shipyard status --json` and parse the output.
2. Display a table of pipeline stages with their status and duration.
3. If any stage failed, show the error and suggest the recovery action:
   - `retriable` / `fixable` → "Run `/deploy --resume` to retry."
   - `credential` → "Run `/setup --repair`."
   - `hard-stop` → Show the manual action required.
4. If the pipeline completed, query store review status:
   - iOS: check App Store Connect for review state
   - Android: check Play Console track status
5. Show a final summary: "App is in review / Approved / Rejected / Pending upload."

## Notes

- If `.shipyard/state.json` doesn't exist, tell the user to run `/deploy` first.
- Live store review status requires valid credentials in the environment.
