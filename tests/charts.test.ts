import { describe, expect, it } from "vitest";
import {
  newEvent,
  type EventRecord,
  type EventType,
} from "@/lib/domain/events";
import {
  componentSchemas,
  makeInstance,
  volumePipeline,
} from "@/lib/domain/components";
import {
  alignChartSeries,
  averageChartPoints,
  buildChartSeries,
  chartConfigSchema,
  chartRange,
  extractChartPoints,
  upgradeChartConfig,
  type ChartSource,
} from "@/lib/domain/charts";

const start = Date.parse("2026-09-14T00:00:00Z");
const end = Date.parse("2026-09-24T12:00:00Z");
const stamp = "2026-09-18T10:00:00Z";
function event(
  type: EventType,
  payload: unknown,
  occurredAt = stamp,
): EventRecord {
  return {
    ...newEvent(type, payload, { occurredAt }),
    userId: crypto.randomUUID(),
    isLocked: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
}
const exercise = {
  exerciseId: "squat",
  sets: [
    { reps: 5, weightKg: 80 },
    { reps: 3, weightKg: 90 },
  ],
};
const values = (events: EventRecord[], source: ChartSource) =>
  extractChartPoints(events, source, start, end).map((p) => p.value);
const config = () =>
  componentSchemas.graph.parse(makeInstance("graph", 0).config);

describe("chart sources", () => {
  it("derives exercise metrics from mixed sets and avoids duplicate legacy children", () => {
    const parent = event("workout", { name: "Leg day", exercises: [exercise] });
    const child = { ...event("exercise", exercise), parentEventId: parent.id };
    const events = [
      parent,
      child,
      event("exercise", {
        exerciseId: "bench",
        sets: [{ reps: 10, weightKg: 20 }],
      }),
    ];
    for (const [metric, expected] of Object.entries({
      volume: 670,
      weight: 90,
      averageWeight: 85,
      sets: 2,
      reps: 8,
    })) {
      expect(
        values(events, {
          type: "exercise",
          target: "squat",
          metric,
        } as ChartSource),
      ).toEqual([expected]);
    }
    expect(
      values(events, { type: "exercise", target: "*", metric: "volume" }),
    ).toEqual([670, 200]);
  });
  it("uses nested occurrence times and filters future/out-of-range data", () => {
    const events = [
      event(
        "workout",
        {
          name: "Leg day",
          exercises: [{ ...exercise, occurredAt: "2026-09-15T11:00:00Z" }],
        },
        "2026-09-13T10:00:00Z",
      ),
      event("exercise", exercise, "2026-09-25T10:00:00Z"),
    ];
    expect(
      extractChartPoints(
        events,
        { type: "exercise", target: "squat", metric: "volume" },
        start,
        end,
      ),
    ).toEqual([
      { time: Date.parse("2026-09-15T11:00:00Z"), value: 670, count: 1 },
    ]);
  });
  it("totals complete workouts including legacy children and duration", () => {
    const nested = event("workout", {
      name: "Leg day",
      exercises: [
        exercise,
        { exerciseId: "bench", sets: [{ reps: 10, weightKg: 20 }] },
      ],
    });
    const legacy = event("workout", { name: "Old workout" });
    const events = [
      nested,
      legacy,
      { ...event("exercise", exercise), parentEventId: legacy.id },
    ];
    expect(
      values(events, { type: "workout", target: "*", metric: "volume" }),
    ).toEqual([870, 670]);
    expect(
      values(events, { type: "workout", target: "Leg day", metric: "reps" }),
    ).toEqual([18]);
    expect(
      values(events, { type: "workout", target: "Leg day", metric: "sets" }),
    ).toEqual([3]);
    expect(
      values(events, {
        type: "workout",
        target: "Leg day",
        metric: "exercises",
      }),
    ).toEqual([2]);
    expect(
      values(events, { type: "workout", target: "*", metric: "duration" }),
    ).toEqual([]);
    nested.startedAt = stamp;
    nested.endedAt = "2026-09-18T11:30:00Z";
    expect(
      values(events, { type: "workout", target: "*", metric: "duration" }),
    ).toEqual([90]);
  });
  it("selects the injury from grouped and historical pain readings including zero", () => {
    expect(
      values(
        [
          event("pain_measurement", { injuryId: "knee", painLevel: 0 }),
          event("pain_measurement", {
            readings: [
              { injuryId: "knee", painLevel: 8 },
              { injuryId: "ankle", painLevel: 10 },
            ],
          }),
        ],
        { type: "pain", target: "knee", metric: "painLevel" },
      ),
    ).toEqual([0, 8]);
  });
  it("separates volleyball types, excludes unrecorded ratings, and preserves zero match sets", () => {
    const events = [
      event("training_session", { activityId: "volleyball" }),
      event("training_session", {
        activityId: "volleyball",
        intensity: 4,
        jumps: 3,
      }),
      event("training_session", {
        activityId: "volleyball",
        intensity: 8,
        jumps: 9,
        sessionType: "match",
        setsPlayed: 0,
      }),
    ];
    expect(
      values(events, {
        type: "volleyball",
        sessionType: "all",
        metric: "setsPlayed",
      }),
    ).toEqual([0]);
    expect(
      values(events, {
        type: "volleyball",
        sessionType: "practice",
        metric: "intensity",
      }),
    ).toEqual([4]);
    expect(
      values(events, {
        type: "volleyball",
        sessionType: "match",
        metric: "jumps",
      }),
    ).toEqual([9]);
    expect(
      values(events, {
        type: "volleyball",
        sessionType: "all",
        metric: "count",
      }),
    ).toEqual([1, 1, 1]);
  });
  it("filters measurements by metric AND unit, including negative values", () => {
    expect(
      values(
        [
          event("measurement", {
            metricId: "temperature",
            value: -2,
            unit: "C",
          }),
          event("measurement", {
            metricId: "temperature",
            value: 40,
            unit: "F",
          }),
        ],
        {
          type: "measurement",
          target: "temperature",
          unit: "C",
          metric: "value",
        },
      ),
    ).toEqual([-2]);
  });
});

describe("chart trends and compatibility", () => {
  const points = [
    { time: Date.parse("2026-09-20T23:00:00Z"), value: 2, count: 1 },
    { time: Date.parse("2026-09-20T23:00:00Z"), value: 6, count: 1 },
    { time: Date.parse("2026-09-21T00:00:00Z"), value: 10, count: 1 },
  ];
  it("keeps raw duplicates and averages only recorded values with empty gaps", () => {
    expect(averageChartPoints(points, "raw", start, end)).toEqual(points);
    const daily = averageChartPoints(points, "day", start, end);
    expect(
      daily.find((p) => p.time === Date.parse("2026-09-20T00:00:00Z")),
    ).toMatchObject({ value: 4, count: 2 });
    expect(daily[0]).toMatchObject({ value: null, count: 0 });
    expect(averageChartPoints(points, "week", start, end)).toEqual([
      { time: start, value: 4, count: 2 },
      { time: Date.parse("2026-09-21T00:00:00Z"), value: 10, count: 1 },
    ]);
  });
  it("supports weeks as a range, inherited modes and independent overrides", () => {
    const c = config();
    c.range = { amount: 2, unit: "weeks" };
    c.mode = "week";
    c.entries[1].mode = "raw";
    expect(chartRange(c, new Date(end)).start).toBe(
      Date.parse("2026-09-11T00:00:00Z"),
    );
    expect(buildChartSeries([], c, new Date(end)).map((s) => s.mode)).toEqual([
      "week",
      "raw",
    ]);
    const partial = buildChartSeries(
      [
        event("exercise", exercise, "2026-09-10T10:00:00Z"),
        event("exercise", exercise, "2026-09-11T10:00:00Z"),
      ],
      c,
      new Date(end),
    );
    expect(partial[0].points[0]).toMatchObject({
      time: Date.parse("2026-09-07T00:00:00Z"),
      value: 670,
      count: 1,
    });
  });
  it("isolates disabled trends to entries that use them", () => {
    const c = config();
    c.entries[1].mode = "raw";
    const result = buildChartSeries(
      [event("pain_measurement", { injuryId: "left-knee", painLevel: 4 })],
      c,
      new Date(end),
      ["chart_source"],
    );
    expect(result[0].error).toContain("trends are unavailable");
    expect(result[1].error).toBeUndefined();
    expect(result[1].points[0].value).toBe(4);
    expect(
      buildChartSeries([], c, new Date(end), ["chart_trend"])[0].error,
    ).toContain("sources are unavailable");
  });
  it("preserves legacy pipelines, styling and totals through upgrades", () => {
    const old = {
      days: 21,
      display: "bar",
      sources: [
        { name: "Custom volume", unit: "kg·reps", pipeline: volumePipeline() },
      ],
    };
    const upgraded = upgradeChartConfig(old);
    expect(upgraded.entries[0]).toMatchObject({
      name: "Custom volume",
      display: "bar",
      color: "volume",
      source: { type: "legacy", pipeline: volumePipeline() },
    });
    expect(
      buildChartSeries(
        [event("exercise", exercise), event("exercise", exercise)],
        upgraded,
        new Date(end),
      )[0].points[0].value,
    ).toBe(1340);
    expect(upgradeChartConfig(upgraded)).toEqual(upgraded);
  });
  it("aligns duplicate timestamps without merging and breaks lines at missing trend buckets", () => {
    const c = config();
    const { rows, segments } = alignChartSeries([
      { entry: c.entries[0], mode: "raw", unit: "kg", points },
      {
        entry: c.entries[1],
        mode: "day",
        unit: "/10",
        points: [
          { time: points[0].time, value: 5, count: 1 },
          { time: points[2].time, value: null, count: 0 },
          { time: end, value: 3, count: 1 },
        ],
      },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows[0][c.entries[0].id]).toBe(2);
    expect(rows[1][c.entries[0].id]).toBe(6);
    expect(segments.filter((s) => s.seriesIndex === 1)).toHaveLength(2);
  });
  it("validates many entries and rejects arbitrary sources, mismatched metrics and duplicate IDs", () => {
    const c = config();
    c.entries = Array.from({ length: 20 }, () => ({
      ...c.entries[0],
      id: crypto.randomUUID(),
    }));
    expect(chartConfigSchema.safeParse(c).success).toBe(true);
    expect(
      chartConfigSchema.safeParse({
        ...c,
        entries: [...c.entries, c.entries[0]],
      }).success,
    ).toBe(false);
    expect(
      chartConfigSchema.safeParse({
        ...c,
        entries: [c.entries[0], c.entries[0]],
      }).success,
    ).toBe(false);
    for (const source of [
      { type: "sql", query: "select *" },
      { type: "pain", target: "knee", metric: "volume" },
    ])
      expect(
        chartConfigSchema.safeParse({
          ...c,
          entries: [{ ...c.entries[0], source }],
        }).success,
      ).toBe(false);
  });
});
