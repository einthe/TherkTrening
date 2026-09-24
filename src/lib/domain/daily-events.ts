import type { EventRecord, EventType } from "./events";

export function localDay(value: string | Date = new Date()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function nextLocalMidnight(value: string | Date) {
  const date = new Date(value);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  ).toISOString();
}

export function latestForDay(
  events: EventRecord[],
  type: EventType,
  day: string,
) {
  return events
    .filter(
      (e) =>
        e.eventType === type &&
        e.schemaVersion === 1 &&
        localDay(e.occurredAt) === day,
    )
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) ||
        b.createdAt.localeCompare(a.createdAt),
    )[0];
}

export function isEventLocked(event: EventRecord, now = Date.now()) {
  return (
    event.isLocked ||
    Boolean(event.autoLockAt && Date.parse(event.autoLockAt) <= now)
  );
}
