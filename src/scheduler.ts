import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { emitSchedulerChange, onSchedulerChange } from "./scheduler-events.ts";
import { createScheduledPrompt, readStore, updateStore } from "./store.ts";
import { formatRunAt } from "./time.ts";
import type { ScheduledPrompt } from "./types.ts";

export const TICK_MS = 2_000;
export const SIDEBAR_MAX_JOBS = 6;
const MAX_TIMER_DELAY_MS = 60_000;

export interface ScheduleDialogState {
  jobs: ScheduledPrompt[];
  paused: boolean;
}

export function currentSessionID(api: TuiPluginApi): string | undefined {
  if (api.route.current.name !== "session") {
    return undefined;
  }

  const sessionID = api.route.current.params?.sessionID;
  return typeof sessionID === "string" ? sessionID : undefined;
}

export function sortPending(left: ScheduledPrompt, right: ScheduledPrompt): number {
  return left.runAt - right.runAt || left.createdAt - right.createdAt;
}

export async function loadSchedulerState(): Promise<ScheduleDialogState> {
  const store = await readStore();
  return {
    jobs: store.jobs.filter((job) => job.status === "pending").sort(sortPending),
    paused: store.settings.paused,
  };
}

export async function addScheduledPrompt(api: TuiPluginApi, prompt: string, runAt: number): Promise<void> {
  const sessionID = currentSessionID(api);
  if (!sessionID) {
    api.ui.toast({ message: "Open a session before scheduling a prompt", variant: "error", duration: 3000 });
    return;
  }

  const job = createScheduledPrompt({ prompt, runAt, sessionID });
  await updateStore((store) => ({
    ...store,
    jobs: [job, ...store.jobs],
  }));
  emitSchedulerChange();
  api.ui.toast({ message: `Scheduled for ${formatRunAt(runAt)}`, variant: "success", duration: 3000 });
}

export async function toggleSchedulerPause(api: TuiPluginApi): Promise<boolean> {
  const store = await updateStore((current) => ({
    ...current,
    settings: {
      paused: !current.settings.paused,
    },
  }));

  api.ui.toast({
    message: store.settings.paused ? "Scheduler paused" : "Scheduler resumed",
    variant: store.settings.paused ? "warning" : "success",
    duration: 2500,
  });
  emitSchedulerChange();

  return store.settings.paused;
}

export async function cancelScheduledPrompt(api: TuiPluginApi, job: ScheduledPrompt): Promise<void> {
  await updateStore((store) => ({
    ...store,
    jobs: store.jobs.map((current) =>
      current.id === job.id
        ? {
            ...current,
            status: "canceled",
            canceledAt: Date.now(),
          }
        : current,
    ),
  }));
  emitSchedulerChange();
  api.ui.toast({ message: "Scheduled prompt canceled", variant: "success", duration: 2500 });
}

async function deliverJob(api: TuiPluginApi, job: ScheduledPrompt): Promise<void> {
  const sessionID = job.sessionID ?? currentSessionID(api);
  if (!sessionID) {
    throw new Error("No session available for schedule");
  }

  const result = await api.client.session.promptAsync({
    sessionID,
    parts: [{ type: "text", text: job.prompt }],
  });

  if (result.error) {
    throw new Error("Failed to send schedule");
  }
}

export async function deliverDuePrompts(api: TuiPluginApi): Promise<void> {
  const store = await readStore();
  if (store.settings.paused) {
    return;
  }

  const now = Date.now();
  const due = store.jobs.filter((job) => job.status === "pending" && job.runAt <= now);
  for (const job of due) {
    try {
      await deliverJob(api, job);
      await updateStore((current) => ({
        ...current,
        jobs: current.jobs.map((item) =>
          item.id === job.id
            ? {
                ...item,
                status: "sent",
                sentAt: Date.now(),
                lastAttemptAt: Date.now(),
                error: undefined,
              }
            : item,
        ),
      }));
      emitSchedulerChange();
      api.ui.toast({ message: "Scheduled prompt sent", variant: "success", duration: 2500 });
      void api.attention.notify({ message: "Scheduled prompt sent", sound: { name: "done", when: "blurred" }, notification: { when: "blurred" } });
    } catch (error) {
      await updateStore((current) => ({
        ...current,
        jobs: current.jobs.map((item) =>
          item.id === job.id
            ? {
                ...item,
                status: "failed",
                lastAttemptAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
              }
            : item,
        ),
      }));
      emitSchedulerChange();
      api.ui.toast({ message: "Scheduled prompt failed", variant: "error", duration: 3000 });
    }
  }
}

async function nextWakeDelay(): Promise<number> {
  const store = await readStore();
  if (store.settings.paused) {
    return MAX_TIMER_DELAY_MS;
  }

  const nextJob = store.jobs.filter((job) => job.status === "pending").sort(sortPending)[0];
  if (!nextJob) {
    return MAX_TIMER_DELAY_MS;
  }

  return Math.max(0, Math.min(nextJob.runAt - Date.now(), MAX_TIMER_DELAY_MS));
}

export function startScheduler(api: TuiPluginApi): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let running = false;
  let rerun = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedule = async () => {
    if (disposed) {
      return;
    }

    clearTimer();
    const delay = await nextWakeDelay();
    if (disposed) {
      return;
    }

    timer = setTimeout(() => {
      void run();
    }, delay);
  };

  const run = async () => {
    if (disposed) {
      return;
    }

    if (running) {
      rerun = true;
      return;
    }

    running = true;
    try {
      await deliverDuePrompts(api);
    } finally {
      running = false;
    }

    if (rerun) {
      rerun = false;
      void run();
      return;
    }

    void schedule();
  };

  const disposeSchedulerChange = onSchedulerChange(() => {
    void run();
  });

  void run();

  return () => {
    disposed = true;
    clearTimer();
    disposeSchedulerChange();
  };
}
