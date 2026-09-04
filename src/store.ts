import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { randomUUID } from "crypto";
import type { ScheduledPrompt, SchedulerStore } from "./types.ts";

const STORE_FILE = "schedules.json";
const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

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
          (job.source === undefined || job.source === "user" || job.source === "agent") &&
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

async function writeStoreFile(store: SchedulerStore): Promise<void> {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempPath, path);
}

async function removeStaleLock(lockPath: string): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
      await unlink(lockPath);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function withStoreLock<Value>(operation: () => Promise<Value>): Promise<Value> {
  const lockPath = `${storePath()}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  let lock: Awaited<ReturnType<typeof open>> | undefined;

  while (!lock) {
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }

      await removeStaleLock(lockPath);
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
        throw new Error("Timed out waiting for the schedule store lock");
      }

      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  try {
    return await operation();
  } finally {
    await lock.close();
    try {
      await unlink(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
}

export async function writeStore(store: SchedulerStore): Promise<void> {
  await withStoreLock(() => writeStoreFile(store));
}

export async function updateStore(update: (store: SchedulerStore) => SchedulerStore): Promise<SchedulerStore> {
  return withStoreLock(async () => {
    const next = update(await readStore());
    await writeStoreFile(next);
    return next;
  });
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

export function createScheduledPrompt(input: {
  prompt: string;
  runAt: number;
  sessionID?: string;
  source?: ScheduledPrompt["source"];
}): ScheduledPrompt {
  return {
    id: randomUUID(),
    prompt: input.prompt,
    runAt: input.runAt,
    createdAt: Date.now(),
    status: "pending",
    source: input.source,
    sessionID: input.sessionID,
  };
}
