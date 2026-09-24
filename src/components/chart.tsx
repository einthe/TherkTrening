"use client";
import { useMemo, useState } from "react";
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
import { ChartNoAxesCombined } from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import {
  alignChartSeries,
  buildChartSeries,
  chartEntryName,
  chartRange,
  type ChartCatalog,
} from "@/lib/domain/charts";
import type { EventRecord } from "@/lib/domain/events";
import { formatDate, number } from "./ui";
const modeNames = {
  raw: "Raw data",
  day: "Daily averages",
  week: "Weekly averages",
};
export function Graph({
  instance,
  events,
  operators,
  catalog,
}: {
  instance: Instance;
  events: EventRecord[];
  operators: string[];
  catalog: ChartCatalog;
}) {
  const [page, setPage] = useState(0);
  const config = useMemo(
    () => componentSchemas.graph.parse(instance.config),
    [instance.config],
  );
  const result = useMemo(() => {
    const now = new Date();
    const series = buildChartSeries(events, config, now, operators);
    return { series, ...alignChartSeries(series), ...chartRange(config, now) };
  }, [events, config, operators]);
  const names = result.series.map((s) => chartEntryName(s.entry, catalog));
  const colors = result.series.map((s) =>
    s.entry.color === "volume"
      ? "var(--chart-volume)"
      : s.entry.color === "pain"
        ? "var(--chart-pain)"
        : s.entry.color,
  );
  const units = [...new Set(result.series.map((s) => s.unit))];
  const hasData = result.series.some((s) =>
    s.points.some((p) => p.value !== null),
  );
  const pages = Math.max(1, Math.ceil(result.rows.length / 100));
  const currentPage = Math.min(page, pages - 1);
  return (
    <>
      <div className="graph-toolbar">
        <span className="micro">
          Last {config.range.amount} {config.range.unit} ·{" "}
          {modeNames[config.mode]}
        </span>
      </div>
      <div className="graph-legend">
        {result.series.map((s, i) => (
          <span key={s.entry.id}>
            <i style={{ background: colors[i] }} />
            {names[i]}{" "}
            <span className="muted">
              ({s.unit || "unitless"}) · {modeNames[s.mode]}
            </span>
          </span>
        ))}
      </div>
      {result.series
        .filter((s) => s.error)
        .map((s) => (
          <p className="error" role="alert" key={s.entry.id}>
            {chartEntryName(s.entry, catalog)}: {s.error}
          </p>
        ))}
      {!hasData ? (
        <div className="empty-state">
          <ChartNoAxesCombined />
          <h3>No data in this range</h3>
          <p>Log the selected activities or adjust the chart settings.</p>
        </div>
      ) : (
        <div className="chart-scroll">
          <div
            className="chart"
            role="img"
            aria-label={`${names.join(" compared with ")} over ${config.range.amount} ${config.range.unit}. Missing measurements are left empty.`}
            style={{
              minWidth: units.length > 2 ? 320 + units.length * 60 : undefined,
            }}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart
                data={result.rows}
                margin={{ top: 22, right: 8, bottom: 12, left: 0 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--line)"
                  strokeDasharray="3 5"
                />
                <XAxis
                  dataKey="time"
                  type="number"
                  scale="time"
                  domain={[
                    Math.min(
                      result.start,
                      result.rows[0]?.time ?? result.start,
                    ),
                    result.end,
                  ]}
                  tickFormatter={(value) =>
                    formatDate(new Date(value).toISOString(), {
                      timeZone: "UTC",
                    })
                  }
                  stroke="var(--muted)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                {units.map((unit, i) => (
                  <YAxis
                    key={unit}
                    yAxisId={unit}
                    orientation={i % 2 === 0 ? "left" : "right"}
                    width={52}
                    stroke="var(--muted)"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    domain={unit === "/10" ? [0, 10] : [0, "auto"]}
                    tickFormatter={(value) => number(value)}
                    label={{
                      value: unit || "value",
                      position: "insideTop",
                      dy: -20,
                      fill: "var(--muted)",
                      fontSize: 10,
                    }}
                  />
                ))}
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(Number(value)).toLocaleString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })
                  }
                  contentStyle={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--text-soft)", marginBottom: 7 }}
                  formatter={(value, name) => [number(Number(value)), name]}
                />
                {result.series.map(
                  (s, i) =>
                    s.entry.display === "bar" && (
                      <Bar
                        key={s.entry.id}
                        yAxisId={s.unit}
                        dataKey={s.entry.id}
                        name={names[i]}
                        unit={` ${s.unit}`}
                        fill={colors[i]}
                        maxBarSize={24}
                        radius={[3, 3, 0, 0]}
                        isAnimationActive={false}
                      />
                    ),
                )}
                {result.segments.map(({ key, seriesIndex: i }) => {
                  const s = result.series[i];
                  return (
                    s.entry.display !== "bar" && (
                      <Line
                        key={key}
                        yAxisId={s.unit}
                        dataKey={key}
                        name={names[i]}
                        unit={` ${s.unit}`}
                        type="linear"
                        stroke={s.entry.display === "dots" ? "none" : colors[i]}
                        strokeWidth={2}
                        dot={{
                          r: 3,
                          fill: colors[i],
                          stroke: "var(--card)",
                          strokeWidth: 1,
                        }}
                        activeDot={{ r: 5, fill: colors[i] }}
                        connectNulls
                        isAnimationActive={false}
                      />
                    )
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <p className="micro chart-explanation">
        UTC dates. Weekly averages start on Monday. Missing values are not zero.
        Each unit has its own scale.
      </p>
      <details className="chart-data">
        <summary>View chart data</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date (UTC)</th>
                {result.series.map((s, i) => (
                  <th key={s.entry.id}>
                    {names[i]} ({s.unit || "unitless"})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows
                .slice(currentPage * 100, (currentPage + 1) * 100)
                .map((row) => (
                  <tr key={`${row.time}:${row.ordinal}`}>
                    <td>
                      {new Date(row.time).toLocaleString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "UTC",
                      })}
                    </td>
                    {result.series.map((s) => (
                      <td key={s.entry.id}>
                        {row[s.entry.id] == null
                          ? "Not recorded"
                          : number(row[s.entry.id]!)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="chart-data-pages">
            <button
              type="button"
              className="button secondary small"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous data
            </button>
            <span>
              {currentPage + 1} / {pages}
            </span>
            <button
              type="button"
              className="button secondary small"
              disabled={currentPage === pages - 1}
              onClick={() => setPage(currentPage + 1)}
            >
              Next data
            </button>
          </div>
        )}
      </details>
    </>
  );
}
