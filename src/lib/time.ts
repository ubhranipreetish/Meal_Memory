import { env } from "@/lib/env";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimeZone(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function dateKeyFromParts({ year, month, day }: Pick<DateParts, "year" | "month" | "day">) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function offsetAt(date: Date, timeZone: string): number {
  const p = partsInTimeZone(date, timeZone);
  const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function midnightForDateKey(key: string, timeZone: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day);
  let instant = new Date(wallClockUtc);

  // Re-evaluate the offset because it may differ around daylight-saving changes.
  for (let i = 0; i < 3; i++) {
    const next = new Date(wallClockUtc - offsetAt(instant, timeZone));
    if (next.getTime() === instant.getTime()) break;
    instant = next;
  }
  return instant;
}

export function appTimeZone(): string {
  const timeZone = env.appTimeZone();
  // Fail early with a useful configuration error instead of silently grouping
  // logs in the server's timezone.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new Error(`Invalid APP_TIME_ZONE: ${timeZone}`);
  }
  return timeZone;
}

export function dateKey(date = new Date(), timeZone = appTimeZone()): string {
  return dateKeyFromParts(partsInTimeZone(date, timeZone));
}

export function recentWeek(now = new Date(), timeZone = appTimeZone()) {
  const { year, month, day } = partsInTimeZone(now, timeZone);
  const keys = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(year, month - 1, day - i)).toISOString().slice(0, 10),
  );
  return { keys, start: midnightForDateKey(keys[keys.length - 1], timeZone), end: dayBounds(now, timeZone).end };
}

export function dayBounds(date = new Date(), timeZone = appTimeZone()) {
  const key = dateKey(date, timeZone);
  const [year, month, day] = key.split("-").map(Number);
  const nextKey = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return {
    key,
    start: midnightForDateKey(key, timeZone),
    end: midnightForDateKey(nextKey, timeZone),
  };
}

export function hourInTimeZone(date = new Date(), timeZone = appTimeZone()): number {
  const { hour, minute } = partsInTimeZone(date, timeZone);
  return hour + minute / 60;
}

export function formatAppDate(
  date = new Date(),
  options: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" },
) {
  return date.toLocaleDateString("en-IN", { ...options, timeZone: appTimeZone() });
}

export function formatAppTime(date: Date) {
  return date.toLocaleTimeString("en-IN", {
    timeZone: appTimeZone(),
    hour: "2-digit",
    minute: "2-digit",
  });
}
