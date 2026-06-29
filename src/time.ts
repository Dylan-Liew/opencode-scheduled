export interface ParsedScheduleRequest {
  prompt: string;
  runAt?: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function setClock(date: Date, hour: number, minute: number): Date {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function parseClock(value: string): { hour: number; minute: number } | undefined {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return undefined;
  }

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (hour > 23 || minute > 59) {
    return undefined;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return undefined;
    }

    hour = hour % 12;
    if (meridiem === "pm") {
      hour += 12;
    }
  }

  return { hour, minute };
}

function capture(match: RegExpMatchArray, index: number): string {
  return match[index] ?? "";
}

export function formatRunAt(runAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(runAt));
}

export function parseTimeSpec(spec: string, now = new Date()): number | undefined {
  const input = spec.trim().replace(/\s+/g, " ");
  if (!input) {
    return undefined;
  }

  const relative = input.match(/^in\s+(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
  if (relative) {
    const amount = Number(capture(relative, 1));
    const unit = capture(relative, 2).toLowerCase();
    const multiplier = unit.startsWith("s") ? 1000 : unit.startsWith("m") ? MINUTE_MS : unit.startsWith("h") ? HOUR_MS : DAY_MS;
    return now.getTime() + amount * multiplier;
  }

  const dayClock = input.match(/^(today|tomorrow)\s+(.+)$/i);
  if (dayClock) {
    const clock = parseClock(capture(dayClock, 2));
    if (!clock) {
      return undefined;
    }

    const base = new Date(now);
    if (capture(dayClock, 1).toLowerCase() === "tomorrow") {
      base.setDate(base.getDate() + 1);
    }

    const target = setClock(base, clock.hour, clock.minute);
    return target.getTime() > now.getTime() ? target.getTime() : undefined;
  }

  const clock = parseClock(input.replace(/^at\s+/i, ""));
  if (clock) {
    let target = setClock(now, clock.hour, clock.minute);
    if (target.getTime() <= now.getTime()) {
      target = new Date(target.getTime() + DAY_MS);
    }

    return target.getTime();
  }

  const isoLike = input.match(/^(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2}:\d{2})(?:\s*(am|pm))?)?$/i);
  if (isoLike) {
    const suffix = isoLike[2] ? ` ${isoLike[2]}${isoLike[3] ? ` ${isoLike[3]}` : ""}` : "";
    const parsed = new Date(`${capture(isoLike, 1)}${suffix}`);
    return Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed.getTime() : undefined;
  }

  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) && parsed.getTime() > now.getTime() ? parsed.getTime() : undefined;
}

export function parseScheduleRequest(raw: string, now = new Date()): ParsedScheduleRequest {
  const input = raw.trim();
  if (!input) {
    return { prompt: "" };
  }

  const relative = input.match(/^(in\s+\d+\s*(?:s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days))\s+(.+)$/i);
  if (relative) {
    return {
      runAt: parseTimeSpec(capture(relative, 1), now),
      prompt: capture(relative, 2).trim(),
    };
  }

  const dayClock = input.match(/^((?:today|tomorrow)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+)$/i);
  if (dayClock) {
    return {
      runAt: parseTimeSpec(capture(dayClock, 1), now),
      prompt: capture(dayClock, 2).trim(),
    };
  }

  const atClock = input.match(/^at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+)$/i);
  if (atClock) {
    return {
      runAt: parseTimeSpec(capture(atClock, 1), now),
      prompt: capture(atClock, 2).trim(),
    };
  }

  return { prompt: input };
}
