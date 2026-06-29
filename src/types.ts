export type ScheduleStatus = "pending" | "sent" | "canceled" | "failed";

export interface ScheduledPrompt {
  id: string;
  prompt: string;
  runAt: number;
  createdAt: number;
  status: ScheduleStatus;
  sessionID?: string;
  sentAt?: number;
  canceledAt?: number;
  lastAttemptAt?: number;
  error?: string;
}

export interface SchedulerSettings {
  paused: boolean;
}

export interface SchedulerStore {
  version: 1;
  draftPrompt?: string;
  jobs: ScheduledPrompt[];
  settings: SchedulerSettings;
}
