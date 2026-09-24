"use client";
import { useMemo, useState } from "react";
import { injuryName, type Injury } from "@/lib/domain/injuries";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Activity,
  Check,
  Settings2,
  ArrowUpRight,
  Dumbbell,
  Heart,
  LockKeyhole,
  ChartNoAxesCombined,
  Volleyball,
  Gauge,
} from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import { describeEvent, type EventRecord } from "@/lib/domain/events";
import { alignByDate, runPipeline } from "@/lib/domain/operators";
import { formatDate, formatTime, number } from "./ui";
export const eventIcons = {
  pain_measurement: Heart,
  exercise: Dumbbell,
  workout: Dumbbell,
  training_session: Volleyball,
  measurement: Gauge,
};
export function Graph({
  instance,
  events,
  operators,
  injuries,
}: {
  instance: Instance;
  events: EventRecord[];
  operators: string[];
  injuries: Injury[];
}) {
  const config = componentSchemas.graph.parse(instance.config);
  config.sources = config.sources.map((source) => {
    const target = source.pipeline.find(
      (step) => step.key === "filter_target" && step.field === "injuryId",
    );
    return target?.key === "filter_target"
      ? { ...source, name: `${injuryName(target.value, injuries)} pain` }
      : source;
  });
  const [days, setDays] = useState(config.days);
  const result = useMemo(() => {
    try {
      if (!operators.includes("align_by_date"))
        throw new Error("Date alignment is currently unavailable.");
      const now = new Date();
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - days + 1);
      from.setUTCHours(0, 0, 0, 0);
      const points = config.sources.map((s) =>
        runPipeline(
          events,
          [
            {
              key: "filter_date",
              from: from.toISOString(),
              to: now.toISOString(),
            },
            ...s.pipeline,
          ],
          operators,
        ),
      );
      return { data: alignByDate(points), error: "" };
    } catch (e) {
      return {
        data: [],
        error:
          e instanceof Error ? e.message : "Unable to calculate this graph.",
      };
    }
  }, [events, days, config.sources, operators]);
  const colors = ["var(--chart-volume)", "var(--chart-pain)"];
  return (
    <>
      <div className="graph-toolbar">
        <select
          aria-label="Graph time range"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {[...new Set([7, 21, 30, 90, config.days])]
            .sort((a, b) => a - b)
            .map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
        </select>
      </div>
      <div className="graph-legend">
        {config.sources.map((s, i) => (
          <span key={i}>
            <i style={{ background: colors[i] }} />
            {s.name} <span className="muted">({s.unit})</span>
          </span>
        ))}
      </div>
      {result.error ? (
        <div className="empty-state error" role="alert">
          {result.error}
          <p>Review the component settings or available operators.</p>
        </div>
      ) : !result.data.length ? (
        <div className="empty-state">
          <ChartNoAxesCombined />
          <h3>No data in this range</h3>
          <p>Log a check-in or exercise to see your first data point.</p>
        </div>
      ) : (
        <div
          className="chart"
          role="img"
          aria-label={`${config.sources.map((s) => s.name).join(" compared with ")} over ${days} days. Missing measurements are left empty.`}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart
              data={result.data}
              margin={{ top: 15, right: 5, bottom: 5, left: -22 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--line)"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="date"
                tickFormatter={(v) =>
                  new Date(`${v}T12:00:00Z`).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })
                }
                stroke="var(--muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
                dy={10}
              />
              <YAxis
                yAxisId="0"
                stroke="var(--muted)"
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              {config.sources.length > 1 && (
                <YAxis
                  yAxisId="1"
                  orientation="right"
                  width={35}
                  stroke="var(--muted)"
                  domain={
                    config.sources[1].unit === "/10"
                      ? [0, 10]
                      : ["auto", "auto"]
                  }
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--text-soft)", marginBottom: 7 }}
                formatter={(value, name) => [number(Number(value)), name]}
              />
              {config.sources.map((s, i) =>
                config.display === "bar" ? (
                  <Bar
                    key={i}
                    yAxisId={String(i)}
                    dataKey={`series${i}`}
                    name={s.name}
                    fill={colors[i]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                ) : (
                  <Line
                    key={i}
                    type="linear"
                    yAxisId={String(i)}
                    dataKey={`series${i}`}
                    name={s.name}
                    stroke={colors[i]}
                    strokeWidth={2.5}
                    dot={{
                      r: 3,
                      fill: colors[i],
                      stroke: "var(--card)",
                      strokeWidth: 2,
                    }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                ),
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="graph-note">
        <Activity size={13} />
        <span>
          Volume = sets × reps × weight for identical sets; for different sets,
          add each set’s reps × weight. A training-volume placeholder, not a
          medical measure.
        </span>
      </div>
      <details className="chart-data">
        <summary>View chart data · UTC days · gaps mean no measurement</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {config.sources.map((s, i) => (
                  <th key={i}>
                    {s.name} ({s.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.map((p) => (
                <tr key={p.date}>
                  <td>{p.date}</td>
                  {config.sources.map((_, i) => (
                    <td key={i}>
                      {p[`series${i}`] === null
                        ? "Not recorded"
                        : number(Number(p[`series${i}`]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
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
                  weekday: "narrow",
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
