import { describe, expect, it } from "vitest";
import {
  assertAdmin,
  assertApproved,
  assertMutable,
  eventInputSchema,
  newEvent,
  validateParent,
  type EventRecord,
  type Profile,
} from "@/lib/domain/events";
import {
  alignByDate,
  dailyAggregation,
  runPipeline,
  volumeLoad,
} from "@/lib/domain/operators";
import {
  instanceInputSchema,
  makeInstance,
  volumePipeline,
} from "@/lib/domain/components";
const owner = "11111111-1111-4111-8111-111111111111";
const profile: Profile = {
  id: owner,
  username: "alice",
  role: "user",
  accountStatus: "approved",
};
const record = (
  input = newEvent("exercise", {
    exerciseId: "squat",
    sets: [
      { reps: 5, weightKg: 80 },
      { reps: 5, weightKg: 80 },
      { reps: 3, weightKg: 90 },
    ],
  }),
): EventRecord => ({
  ...input,
  userId: owner,
  isLocked: false,
  createdAt: "2026-09-18T10:00:00Z",
  updatedAt: "2026-09-18T10:00:00Z",
});
describe("event validation", () => {
  it("preserves non-uniform sets and backdated event time", () => {
    const e = record(
      newEvent(
        "exercise",
        {
          exerciseId: "squat",
          sets: [
            { reps: 5, weightKg: 80 },
            { reps: 3, weightKg: 90 },
          ],
        },
        { occurredAt: "2020-01-01T10:00:00Z" },
      ),
    );
    expect(e.occurredAt).not.toBe(e.createdAt);
    expect(e.startedAt).toBeNull();
    expect(volumeLoad(e.payload)).toBe(670);
  });
  it.each([-1, 11, NaN])("rejects invalid pain value %s", (painLevel) =>
    expect(() =>
      newEvent("pain_measurement", { injuryId: "left-knee", painLevel }),
    ).toThrow(),
  );
  it("rejects invalid exercise and unknown payload fields", () => {
    expect(() =>
      newEvent("exercise", { exerciseId: "squat", sets: [] }),
    ).toThrow();
    expect(() =>
      newEvent("exercise", {
        exerciseId: "squat",
        sets: [{ reps: 2.5, weightKg: 80 }],
      }),
    ).toThrow();
    expect(() =>
      newEvent("pain_measurement", {
        injuryId: "left-knee",
        painLevel: 3,
        code: "evil",
      }),
    ).toThrow();
  });
  it("validates optional duration and notes", () => {
    expect(() =>
      newEvent("training_session", { activityId: "volleyball" }),
    ).not.toThrow();
    expect(() =>
      newEvent(
        "training_session",
        { activityId: "volleyball" },
        { endedAt: "2026-01-01T11:00:00Z" },
      ),
    ).toThrow();
    expect(() =>
      newEvent(
        "training_session",
        { activityId: "volleyball" },
        { startedAt: "2026-01-01T12:00:00Z", endedAt: "2026-01-01T11:00:00Z" },
      ),
    ).toThrow();
    expect(() =>
      newEvent("workout", { name: "Leg day" }, { notes: "x".repeat(4001) }),
    ).toThrow();
  });
  it("preserves batch IDs and rejects unsupported schema versions", () => {
    const batchId = crypto.randomUUID();
    const e = newEvent(
      "pain_measurement",
      { injuryId: "left-knee", painLevel: 2 },
      { batchId },
    );
    expect(e.batchId).toBe(batchId);
    expect(eventInputSchema.safeParse({ ...e, schemaVersion: 2 }).success).toBe(
      false,
    );
  });
  it("requires an owned workout parent", () => {
    const parent = record(newEvent("workout", { name: "Leg day" }));
    const child = newEvent(
      "exercise",
      { exerciseId: "squat", sets: [{ reps: 5, weightKg: 80 }] },
      { parentEventId: parent.id },
    );
    expect(() => validateParent(child, [parent], owner)).not.toThrow();
    expect(() =>
      validateParent(
        child,
        [{ ...parent, userId: crypto.randomUUID() }],
        owner,
      ),
    ).toThrow();
    expect(() => validateParent(child, [], owner)).toThrow();
  });
});
describe("operators", () => {
  it.each([
    {
      name: "identical sets use sets × reps × weight",
      sets: [
        { reps: 5, weightKg: 80 },
        { reps: 5, weightKg: 80 },
        { reps: 5, weightKg: 80 },
      ],
      expected: 1200,
    },
    {
      name: "sets with different reps and weights each contribute their own volume",
      sets: [
        { reps: 5, weightKg: 80 },
        { reps: 4, weightKg: 85 },
        { reps: 3, weightKg: 90 },
      ],
      expected: 1010,
    },
  ])("$name", ({ sets, expected }) => {
    const event = record(newEvent("exercise", { exerciseId: "squat", sets }));
    expect(volumeLoad(event.payload)).toBe(expected);
    expect(runPipeline([event], volumePipeline())[0].value).toBe(expected);
  });
  it("calculates placeholder volume from unequal sets without rewriting events", () => {
    const e = record();
    const copy = structuredClone(e);
    expect(volumeLoad(e.payload)).toBe(1070);
    expect(runPipeline([e], volumePipeline())[0].value).toBe(1070);
    expect(e).toEqual(copy);
  });
  it("uses occurredAt for inclusive date filtering", () => {
    const e = record(
      newEvent(
        "exercise",
        { exerciseId: "squat", sets: [{ reps: 5, weightKg: 80 }] },
        { occurredAt: "2020-01-01T10:00:00Z" },
      ),
    );
    expect(
      runPipeline(
        [e],
        [
          {
            key: "filter_date",
            from: "2020-01-01T10:00:00Z",
            to: "2020-01-01T10:00:00Z",
          },
          ...volumePipeline(),
        ],
      ),
    ).toHaveLength(1);
    expect(
      runPipeline(
        [e],
        [
          {
            key: "filter_date",
            from: "2026-01-01T00:00:00Z",
            to: "2026-12-31T00:00:00Z",
          },
          ...volumePipeline(),
        ],
      ),
    ).toEqual([]);
  });
  it("aggregates UTC days deterministically", () => {
    const points = [
      { date: "2026-01-01T20:00:00Z", value: 20 },
      { date: "2026-01-02T01:00:00+02:00", value: 10 },
    ];
    expect(dailyAggregation(points, "sum")).toEqual([
      { date: "2026-01-01", value: 30 },
    ]);
    expect(dailyAggregation(points, "average")[0].value).toBe(15);
    expect(dailyAggregation(points, "min")[0].value).toBe(10);
    expect(dailyAggregation(points, "max")[0].value).toBe(20);
    expect(dailyAggregation(points, "count")[0].value).toBe(2);
  });
  it("extracts supported fields and rejects incompatible inputs", () => {
    const pain = record(
      newEvent("pain_measurement", { injuryId: "left-knee", painLevel: 3 }),
    );
    expect(
      runPipeline([pain], [{ key: "extract_field", field: "painLevel" }])[0]
        .value,
    ).toBe(3);
    expect(() =>
      runPipeline([pain], [{ key: "placeholder_volume_load" }]),
    ).toThrow();
    expect(() =>
      runPipeline([record()], [{ key: "extract_field", field: "painLevel" }]),
    ).toThrow();
  });
  it("handles empty input, rejects unknown/disabled operators and bad ordering", () => {
    expect(runPipeline([], volumePipeline())).toEqual([]);
    expect(() => runPipeline([], [{ key: "eval", code: "1+1" }])).toThrow();
    expect(() => runPipeline([], volumePipeline(), [])).toThrow();
    expect(() =>
      runPipeline([], [{ key: "daily_aggregation", method: "sum" }]),
    ).toThrow();
    expect(() =>
      runPipeline(
        [],
        [
          { key: "extract_field", field: "value" },
          { key: "filter_type", eventType: "measurement" },
        ],
      ),
    ).toThrow();
  });
  it("aligns sparse series with explicit nulls instead of inventing zeroes", () => {
    expect(
      alignByDate([
        [{ date: "2026-01-01", value: 100 }],
        [{ date: "2026-01-02", value: 3 }],
      ]),
    ).toEqual([
      { date: "2026-01-01", series0: 100, series1: null },
      { date: "2026-01-02", series0: null, series1: 3 },
    ]);
  });
  it("rejects malformed historical events and unsupported versions", () => {
    expect(() =>
      runPipeline([{ ...record(), schemaVersion: 2 }], volumePipeline()),
    ).toThrow();
    expect(() =>
      runPipeline(
        [{ ...record(), payload: { exerciseId: "squat", sets: [] } }],
        volumePipeline(),
      ),
    ).toThrow();
  });
});
describe("authorization and configuration", () => {
  it.each(["pending", "rejected", "disabled"] as const)(
    "blocks %s accounts",
    (accountStatus) =>
      expect(() => assertApproved({ ...profile, accountStatus })).toThrow(),
  );
  it("allows approved users and denies user admin access", () => {
    expect(() => assertApproved(profile)).not.toThrow();
    expect(() => assertAdmin(profile)).toThrow();
  });
  it("rejects foreign, locked, and stale event mutations", () => {
    const e = record();
    expect(() => assertMutable(e, profile, e.updatedAt)).not.toThrow();
    expect(() =>
      assertMutable(
        { ...e, userId: crypto.randomUUID() },
        profile,
        e.updatedAt,
      ),
    ).toThrow();
    expect(() =>
      assertMutable({ ...e, isLocked: true }, profile, e.updatedAt),
    ).toThrow();
    expect(() => assertMutable(e, profile, "old")).toThrow();
  });
  it("validates all built-in component configurations", () => {
    for (const key of [
      "pain_logger",
      "workout_logger",
      "session_logger",
      "value_logger",
      "graph",
      "statistic",
      "recent_events",
      "weekly_summary",
    ] as const)
      expect(instanceInputSchema.safeParse(makeInstance(key, 0)).success).toBe(
        true,
      );
  });
  it("rejects duplicate pain targets and invalid serialized pipelines", () => {
    const i = makeInstance("pain_logger", 0);
    expect(
      instanceInputSchema.safeParse({
        ...i,
        config: { targets: ["knee", "knee"], showNotes: false },
      }).success,
    ).toBe(false);
    const graph = makeInstance("graph", 0);
    expect(
      instanceInputSchema.safeParse({
        ...graph,
        config: {
          days: 21,
          display: "line",
          sources: [{ name: "Bad", unit: "", pipeline: [{ key: "eval" }] }],
        },
      }).success,
    ).toBe(false);
  });
});
