"use client";
import { useState } from "react";
import {
  Heart,
  Dumbbell,
  ChartNoAxesCombined,
  Activity,
  Gauge,
  History,
  Plus,
  ArrowRight,
} from "lucide-react";
import {
  componentDefinitions,
  componentSchemas,
  makeInstance,
  instanceInputSchema,
  painPipeline,
  volumePipeline,
  type ComponentKey,
  type Instance,
  type InstanceInput,
  type Definition,
} from "@/lib/domain/components";
import { Modal } from "./ui";
export const componentIcons = {
  heart: Heart,
  dumbbell: Dumbbell,
  chart: ChartNoAxesCombined,
  activity: Activity,
  gauge: Gauge,
  history: History,
};
export function ComponentBrowser({
  definitions,
  onSelect,
  onClose,
}: {
  definitions: Definition[];
  onSelect: (key: ComponentKey) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Add component" onClose={onClose} wide>
      <div className="component-browser">
        {componentDefinitions
          .filter((d) => definitions.some((g) => g.key === d.key && g.active))
          .map((d) => {
            const Icon = componentIcons[d.icon];
            return (
              <button
                className="catalog-card"
                key={d.key}
                onClick={() => onSelect(d.key)}
              >
                <div>
                  <span className="catalog-icon">
                    <Icon size={21} />
                  </span>
                  <span className="tag">
                    {d.kind === "logger" ? "LOG" : "DISPLAY"}
                  </span>
                </div>
                <h3>{d.name}</h3>
                <p>{d.description}</p>
                <span className="accent">
                  Configure component <ArrowRight size={14} />
                </span>
              </button>
            );
          })}
      </div>
    </Modal>
  );
}
export function ComponentSettings({
  componentKey,
  existing,
  position,
  onSave,
  onClose,
}: {
  componentKey: ComponentKey;
  existing?: Instance;
  position: number;
  onSave: (i: InstanceInput, expected?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const storedConfigValid =
    !existing ||
    componentSchemas[componentKey].safeParse(existing.config).success;
  const [draft, setDraft] = useState(() => {
    const defaults = makeInstance(componentKey, position);
    if (!existing) return defaults;
    return instanceInputSchema.parse({
      id: existing.id,
      componentDefinitionId: componentKey,
      version: 1,
      title: existing.title,
      enabled: existing.enabled,
      position: existing.position,
      config: storedConfigValid ? existing.config : defaults.config,
    });
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const config = draft.config as Record<string, unknown>;
  function field(key: string, value: unknown) {
    setDraft({ ...draft, config: { ...config, [key]: value } });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = instanceInputSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      if (await onSave(parsed.data, existing?.updatedAt)) onClose();
      else
        setError(
          "Could not save these settings. The component may have changed elsewhere or become unavailable. Close and reload before trying again.",
        );
    } finally {
      setBusy(false);
    }
  }
  const graph =
    componentKey === "graph"
      ? (config as ReturnType<typeof componentSchemas.graph.parse>)
      : null;
  const stat =
    componentKey === "statistic"
      ? (config as ReturnType<typeof componentSchemas.statistic.parse>)
      : null;
  function sourceField(index: number, target: string) {
    if (!graph) return;
    const sources = [...graph.sources];
    const isVolume = sources[index].pipeline.some(
      (s) => s.key === "placeholder_volume_load",
    );
    sources[index] = {
      ...sources[index],
      pipeline: isVolume ? volumePipeline(target) : painPipeline(target),
      name: `${target.replace(/-/g, " ")} ${isVolume ? "volume" : "pain"}`,
    };
    field("sources", sources);
  }
  return (
    <Modal
      title={existing ? "Component settings" : "Add a component"}
      onClose={onClose}
    >
      <form className="settings-form" onSubmit={submit}>
        {!storedConfigValid && (
          <p className="notice">
            The saved configuration is incompatible. Default settings are shown
            below; review them before saving.
          </p>
        )}
        <label>
          Title
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            required
            maxLength={80}
          />
        </label>
        {componentKey === "pain_logger" && (
          <label>
            Tracked targets{" "}
            <span className="muted">(separate with commas)</span>
            <input
              value={(config.targets as string[]).join(", ")}
              onChange={(e) =>
                field(
                  "targets",
                  e.target.value.split(",").map((s) => s.trim()),
                )
              }
            />
            <small>For example: left-knee, right-knee, left-ankle</small>
          </label>
        )}
        {componentKey === "exercise_logger" && (
          <>
            <label>
              Exercise ID
              <input
                value={String(config.exerciseId)}
                onChange={(e) => field("exerciseId", e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <div className="form-grid">
              <label>
                Default reps
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={Number(config.defaultReps)}
                  onChange={(e) => field("defaultReps", Number(e.target.value))}
                />
              </label>
              <label>
                Default weight (kg)
                <input
                  type="number"
                  min="0"
                  max="2000"
                  step="0.5"
                  value={Number(config.defaultWeight)}
                  onChange={(e) =>
                    field("defaultWeight", Number(e.target.value))
                  }
                />
              </label>
            </div>
          </>
        )}
        {componentKey === "session_logger" && (
          <label>
            Activity ID
            <input
              required
              maxLength={80}
              value={String(config.activityId)}
              onChange={(e) => field("activityId", e.target.value)}
            />
          </label>
        )}
        {componentKey === "value_logger" && (
          <>
            <label>
              Metric ID
              <input
                required
                maxLength={80}
                value={String(config.metricId)}
                onChange={(e) => field("metricId", e.target.value)}
              />
            </label>
            <label>
              Unit
              <input
                maxLength={24}
                value={String(config.unit)}
                onChange={(e) => field("unit", e.target.value)}
              />
            </label>
          </>
        )}
        {(graph || stat) && (
          <label>
            Time range
            <select
              value={Number(config.days)}
              onChange={(e) => field("days", Number(e.target.value))}
            >
              {[7, 21, 30, 90, 365].map((d) => (
                <option value={d} key={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </label>
        )}
        {graph && (
          <>
            <label>
              Display
              <select
                value={graph.display}
                onChange={(e) => field("display", e.target.value)}
              >
                <option value="line">Line graph</option>
                <option value="bar">Bar graph</option>
              </select>
            </label>
            {graph.sources.map((source, i) => (
              <label key={i}>
                {source.pipeline.some(
                  (s) => s.key === "placeholder_volume_load",
                )
                  ? "Exercise ID"
                  : "Injury ID"}
                <input
                  required
                  maxLength={80}
                  value={
                    source.pipeline.find((s) => s.key === "filter_target")
                      ?.value ?? ""
                  }
                  onChange={(e) => sourceField(i, e.target.value)}
                />
              </label>
            ))}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={graph.sources.length > 1}
                onChange={(e) =>
                  field(
                    "sources",
                    e.target.checked
                      ? [
                          ...graph.sources,
                          {
                            name: "Left knee pain",
                            unit: "/10",
                            pipeline: painPipeline(),
                          },
                        ]
                      : graph.sources.slice(0, 1),
                  )
                }
              />
              Compare with pain
            </label>
          </>
        )}
        {stat && (
          <>
            <label>
              Calculation
              <select
                value={stat.method}
                onChange={(e) => field("method", e.target.value)}
              >
                <option value="sum">Total</option>
                <option value="average">Average</option>
                <option value="count">Recorded days</option>
                <option value="latest">Latest day</option>
              </select>
            </label>
            <label>
              Exercise ID
              <input
                required
                value={
                  stat.source.pipeline.find((s) => s.key === "filter_target")
                    ?.value ?? "squat"
                }
                onChange={(e) =>
                  field("source", {
                    name: `${e.target.value} volume`,
                    unit: "kg·reps",
                    pipeline: volumePipeline(e.target.value),
                  })
                }
              />
            </label>
          </>
        )}
        {componentKey === "recent_events" && (
          <label>
            Number of events
            <input
              type="number"
              min="1"
              max="50"
              value={Number(config.limit)}
              onChange={(e) => field("limit", Number(e.target.value))}
            />
          </label>
        )}
        {"showNotes" in config && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(config.showNotes)}
              onChange={(e) => field("showNotes", e.target.checked)}
            />
            Show optional notes
          </label>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Show on my dashboard
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <Plus size={16} />
            {busy ? "Saving…" : existing ? "Save changes" : "Add component"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
