"use client";
import {
  Activity,
  Check,
  Settings2,
  ArrowUpRight,
  Dumbbell,
  Heart,
  LockKeyhole,
  Volleyball,
  Gauge,
} from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import { describeEvent, type EventRecord } from "@/lib/domain/events";
import { runPipeline } from "@/lib/domain/operators";
import { formatDate, formatTime, number } from "./ui";
export const eventIcons = {
  pain_measurement: Heart,
  exercise: Dumbbell,
  workout: Dumbbell,
  training_session: Volleyball,
  measurement: Gauge,
};
export function RecentEvents({
  events,
  limit = 5,
  onHistory,
  onSelect,
}: {
  events: EventRecord[];
  limit?: number;
  onHistory: () => void;
  onSelect: (e: EventRecord) => void;
}) {
  const recent = [...events]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
  return (
    <>
      <div className="recent-list">
        {recent.length ? (
          recent.map((e) => {
            const Icon = eventIcons[e.eventType] ?? Activity;
            return (
              <button
                className="recent-row"
                key={e.id}
                onClick={() => onSelect(e)}
              >
                <span className={`event-icon ${e.eventType}`}>
                  <Icon size={16} />
                </span>
                <span className="recent-text">
                  <strong>{describeEvent(e)}</strong>
                  <small>
                    {formatDate(e.occurredAt)} <span>·</span>{" "}
                    {formatTime(e.occurredAt)}
                  </small>
                </span>
                {e.isLocked ? (
                  <LockKeyhole size={13} className="muted" />
                ) : (
                  <span className="event-dot" />
                )}
              </button>
            );
          })
        ) : (
          <div className="empty-state">
            <p>Your logged events will appear here.</p>
          </div>
        )}
      </div>
      <button className="text-button history-link" onClick={onHistory}>
        View all activity
        <ArrowUpRight size={15} />
      </button>
    </>
  );
}
export function Statistic({
  instance,
  events,
  operators,
}: {
  instance: Instance;
  events: EventRecord[];
  operators: string[];
}) {
  const config = componentSchemas.statistic.parse(instance.config);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - config.days + 1);
  start.setUTCHours(0, 0, 0, 0);
  let value: number | null = null;
  let error = "";
  try {
    const points = runPipeline(
      events,
      [
        {
          key: "filter_date",
          from: start.toISOString(),
          to: end.toISOString(),
        },
        ...config.source.pipeline,
      ],
      operators,
    ).sort((a, b) => a.date.localeCompare(b.date));
    value = !points.length
      ? null
      : config.method === "count"
        ? points.length
        : config.method === "latest"
          ? points.at(-1)!.value
          : points.reduce((sum, p) => sum + p.value, 0) /
            (config.method === "average" ? points.length : 1);
  } catch (e) {
    error = e instanceof Error ? e.message : "Invalid statistic.";
  }
  return (
    <div className="statistic">
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <p className="muted">
            {config.source.name} · last {config.days} days
          </p>
          <strong>{value === null ? "—" : number(value)}</strong>
          <span className="muted">
            {" "}
            {config.method === "count" ? "data points" : config.source.unit}
          </span>
          {value === null && <p>No measurements recorded yet.</p>}
        </>
      )}
    </div>
  );
}

export function WeeklySummary({
  instance,
  events,
  onSettings,
}: {
  instance: Instance;
  events: EventRecord[];
  onSettings: () => void;
}) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekEvents = events.filter(
    (e) =>
      Date.parse(e.occurredAt) >= weekStart.getTime() &&
      Date.parse(e.occurredAt) <= new Date().getTime(),
  );
  const sessions = weekEvents.filter(
    (e) => e.eventType === "workout" || e.eventType === "training_session",
  ).length;
  const checkIns = weekEvents.filter(
    (e) => e.eventType === "pain_measurement",
  ).length;
  const activeDays = new Set(
    weekEvents.map((e) => new Date(e.occurredAt).toLocaleDateString()),
  ).size;
  return (
    <div className="overview-strip">
      <div className="overview-title">
        <span className="overview-icon">
          <Activity size={20} />
        </span>
        <div>
          <h2>{instance.title}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={`Settings for ${instance.title}`}
          onClick={onSettings}
        >
          <Settings2 size={16} />
        </button>
      </div>
      <div className="overview-stat">
        <strong>{String(sessions).padStart(2, "0")}</strong>
        <span>training sessions</span>
      </div>
      <div className="overview-stat">
        <strong>{String(checkIns).padStart(2, "0")}</strong>
        <span>pain check-ins</span>
      </div>
      <div className="overview-stat">
        <strong>
          {String(activeDays).padStart(2, "0")}
          <small> / 7</small>
        </strong>
        <span>days checked in</span>
      </div>
      <div
        className="week-dots"
        aria-label={`${activeDays} days with recorded activity in the past week`}
      >
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - 6 + i);
          const active = weekEvents.some(
            (e) =>
              new Date(e.occurredAt).toLocaleDateString() ===
              d.toLocaleDateString(),
          );
          return (
            <div key={i}>
              <span>
                {d.toLocaleDateString("en-GB", {
                  weekday: "short",
                })}
              </span>
              <i className={active ? "filled" : ""}>
                {active ? <Check size={12} /> : null}
              </i>
            </div>
          );
        })}
      </div>
    </div>
  );
}
