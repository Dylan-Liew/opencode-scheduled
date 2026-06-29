import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import type { ScheduledPrompt, SchedulerStore } from "./types.ts";

const STORE_FILE = "schedules.json";

function stateRoot(): string {
  if (process.env.OPENCODE_SCHEDULED_HOME) {
    return process.env.OPENCODE_SCHEDULED_HOME;
  }

  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "opencode-scheduled");
  }

  if (process.env.XDG_STATE_HOME) {
    return join(process.env.XDG_STATE_HOME, "opencode-scheduled");
  }

  return join(process.env.HOME ?? process.cwd(), ".local", "state", "opencode-scheduled");
}

export function storePath(): string {
  return join(stateRoot(), STORE_FILE);
}

function emptyStore(): SchedulerStore {
  return {
    version: 1,
    jobs: [],
    settings: {
      paused: false,
    },
  };
}

function normalizeStore(value: unknown): SchedulerStore {
  const fallback = emptyStore();
  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Partial<SchedulerStore>;
  const jobs = Array.isArray(record.jobs)
    ? record.jobs.filter((job): job is ScheduledPrompt => {
        return (
          Boolean(job) &&
          typeof job === "object" &&
          typeof job.id === "string" &&
          typeof job.prompt === "string" &&
          typeof job.runAt === "number" &&
          typeof job.createdAt === "number" &&
          (job.status === "pending" || job.status === "sent" || job.status === "canceled" || job.status === "failed")
        );
      })
    : [];

  return {
    version: 1,
    draftPrompt: typeof record.draftPrompt === "string" ? record.draftPrompt : undefined,
    jobs,
    settings: {
      paused: record.settings?.paused === true,
    },
  };
}

export async function readStore(): Promise<SchedulerStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyStore();
    }

    throw error;
  }
}

export async function writeStore(store: SchedulerStore): Promise<void> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

export async function updateStore(update: (store: SchedulerStore) => SchedulerStore): Promise<SchedulerStore> {
  const next = update(await readStore());
  await writeStore(next);
  return next;
}

export async function saveDraftPrompt(prompt: string): Promise<void> {
  await updateStore((store) => ({
    ...store,
    draftPrompt: prompt.trim() || undefined,
  }));
}

export async function takeDraftPrompt(): Promise<string | undefined> {
  let draft: string | undefined;
  await updateStore((store) => {
    draft = store.draftPrompt;
    return {
      ...store,
      draftPrompt: undefined,
    };
  });

  return draft;
}

export function createScheduledPrompt(input: { prompt: string; runAt: number; sessionID?: string }): ScheduledPrompt {
  return {
    id: randomUUID(),
    prompt: input.prompt,
    runAt: input.runAt,
    createdAt: Date.now(),
    status: "pending",
    sessionID: input.sessionID,
  };
}
