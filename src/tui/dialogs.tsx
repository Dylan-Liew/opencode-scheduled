/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { formatRunAt, parseScheduleRequest, parseTimeSpec } from "../time.ts";
import { takeDraftPrompt } from "../store.ts";
import type { ScheduledPrompt } from "../types.ts";
import { taskID } from "../format.ts";
import { addScheduledPrompt, cancelScheduledPrompt, loadSchedulerState, toggleSchedulerPause } from "../scheduler.ts";
import { SchedulerManagerDialog } from "./SchedulerManagerDialog.tsx";

function openTimePrompt(api: TuiPluginApi, prompt: string): void {
  const DialogPrompt = api.ui.DialogPrompt;
  api.ui.dialog.replace(() => (
    <DialogPrompt
      title="Schedule Prompt"
      placeholder="in 30m, at 3:30am, today 14:00, tomorrow 9am"
      onCancel={() => openManager(api)}
      onConfirm={async (value) => {
        const runAt = parseTimeSpec(value);
        if (!runAt) {
          api.ui.toast({ message: "Could not understand that time", variant: "error", duration: 3000 });
          openTimePrompt(api, prompt);
          return;
        }

        await addScheduledPrompt(api, prompt, runAt);
        await openManager(api);
      }}
      description={() => (
        <box flexDirection="column" gap={1}>
          <text fg={api.theme.current.textMuted}>Prompt captured. Choose when it should send.</text>
        </box>
      )}
    />
  ));
}

function openPromptInput(api: TuiPluginApi, value = ""): void {
  const DialogPrompt = api.ui.DialogPrompt;
  api.ui.dialog.replace(() => (
    <DialogPrompt
      title="Schedule Prompt"
      value={value}
      placeholder="Prompt to send later"
      onCancel={() => openManager(api)}
      onConfirm={(prompt) => {
        const parsed = parseScheduleRequest(prompt);
        if (!parsed.prompt) {
          api.ui.toast({ message: "Prompt cannot be empty", variant: "error", duration: 2500 });
          openPromptInput(api, prompt);
          return;
        }

        if (parsed.runAt) {
          void addScheduledPrompt(api, parsed.prompt, parsed.runAt).then(() => openManager(api));
          return;
        }

        openTimePrompt(api, parsed.prompt);
      }}
    />
  ));
}

function confirmCancel(api: TuiPluginApi, job: ScheduledPrompt): void {
  const DialogConfirm = api.ui.DialogConfirm;
  api.ui.dialog.replace(() => (
    <DialogConfirm
      title="Cancel Prompt"
      message={`${taskID(job)} at ${formatRunAt(job.runAt)}`}
      onCancel={() => openManager(api)}
      onConfirm={() => {
        void cancelScheduledPrompt(api, job).then(() => openManager(api));
      }}
    />
  ));
}

export async function openManager(api: TuiPluginApi): Promise<void> {
  const state = await loadSchedulerState();
  api.ui.dialog.replace(() => (
    <SchedulerManagerDialog
      api={api}
      initialJobs={state.jobs}
      initialPaused={state.paused}
      loadJobs={loadSchedulerState}
      onAdd={() => openPromptInput(api)}
      onCancel={(job) => confirmCancel(api, job)}
      onTogglePause={() => toggleSchedulerPause(api)}
    />
  ));
}

export async function openScheduler(api: TuiPluginApi): Promise<void> {
  const draft = await takeDraftPrompt();
  if (draft) {
    const parsed = parseScheduleRequest(draft);
    if (parsed.prompt && parsed.runAt) {
      await addScheduledPrompt(api, parsed.prompt, parsed.runAt);
      await openManager(api);
      return;
    }

    openPromptInput(api, parsed.prompt || draft);
    return;
  }

  await openManager(api);
}
