import type { ScheduledPrompt } from "./types.ts";

export function taskID(job: ScheduledPrompt): string {
  return `#${job.id.slice(0, 8)}`;
}

export function formatCompactDate(runAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(runAt));
}
