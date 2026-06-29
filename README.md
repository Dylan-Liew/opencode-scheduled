# OpenCode Scheduled

Schedule prompts from inside OpenCode with `/schedule`.

## Install

Recommended:

```bash
opencode plugin -g opencode-scheduled
```

Manual install:

For a global manual install, add the plugin to both `~/.config/opencode/opencode.json` and `~/.config/opencode/tui.json`.

`~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-scheduled"]
}
```

`~/.config/opencode/tui.json`

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-scheduled"]
}
```

For local development, point both plugin lists at this checkout path.

## Use It

Open the scheduler with either:

- `/schedule`
- `/schedule <prompt>`
- `/schedule in 30m <prompt>`
- `/schedule at 3:30am <prompt>`
- `/schedule today 14:00 <prompt>`
- `/schedule tomorrow 9am <prompt>`
- Command palette -> `Schedule Prompt`

Inside the dialog, choose when the prompt should be sent, review pending items, and cancel schedules. Pending items are shown by task ID and date.

The sidebar also shows pending prompts for the current session by task ID and date. Use the scheduler dialog to pause or resume delivery. When paused, due prompts stay pending until the scheduler is resumed.

## Notes

- Schedules are stored locally in the platform state directory. Set `OPENCODE_SCHEDULED_HOME` to override the storage directory.
- Delivery targets the OpenCode session that was active when the prompt was scheduled.
- Delivery requires OpenCode to be running. If OpenCode is closed at the scheduled time, the prompt will not send until OpenCode is opened again and the plugin timer runs.
- Failed deliveries are marked as failed rather than retried automatically.
