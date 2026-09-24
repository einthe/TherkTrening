"use client";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { NumericInput } from "./numeric-input";
import {
  chartColors,
  chartDefaultSource,
  chartEntryName,
  metricLabels,
  sourceLabels,
  sourceMetrics,
  type ChartCatalog,
  type ChartConfig,
  type ChartEntry,
  type ChartSource,
} from "@/lib/domain/charts";
export function ChartModeOptions({ inherit = false }: { inherit?: boolean }) {
  return (
    <>
      {inherit && <option value="inherit">Same as chart</option>}
      <option value="raw">Raw data</option>
      <option value="day">Daily averages</option>
      <option value="week">Weekly averages</option>
    </>
  );
}
export function ChartSettings({
  config,
  onChange,
  catalog,
  disabled,
}: {
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
  catalog: ChartCatalog;
  disabled: boolean;
}) {
  function update(index: number, changes: Partial<ChartEntry>) {
    onChange({
      ...config,
      entries: config.entries.map((entry, i) =>
        i === index ? { ...entry, ...changes } : entry,
      ),
    });
  }
  function reorder(index: number, step: number) {
    const entries = [...config.entries];
    [entries[index], entries[index + step]] = [
      entries[index + step],
      entries[index],
    ];
    onChange({ ...config, entries });
  }
  return (
    <fieldset className="chart-settings" disabled={disabled}>
      <legend>Chart data</legend>
      <div className="form-grid">
        <label>
          Time range
          <NumericInput
            type="number"
            min="1"
            max="365"
            step="1"
            value={config.range.amount}
            onValueChange={(amount) =>
              onChange({ ...config, range: { ...config.range, amount } })
            }
          />
        </label>
        <label>
          Time unit
          <select
            value={config.range.unit}
            onChange={(e) =>
              onChange({
                ...config,
                range: {
                  ...config.range,
                  unit: e.target.value as "days" | "weeks",
                },
              })
            }
          >
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>
        </label>
      </div>
      <label>
        Chart mode
        <select
          value={config.mode}
          onChange={(e) =>
            onChange({ ...config, mode: e.target.value as ChartConfig["mode"] })
          }
        >
          <ChartModeOptions />
        </select>
      </label>
      <p className="micro">
        Raw data shows each recorded value. Trends average the recorded values
        per day or Monday–Sunday week (UTC). Missing periods stay empty; partial
        weeks include only values in the chosen range.
      </p>
      {config.entries.map((entry, index) => (
        <div className="chart-entry-settings" key={entry.id}>
          <div className="chart-entry-reorder">
            <button
              type="button"
              className="icon-button"
              aria-label={`Move entry ${index + 1} up`}
              disabled={index === 0}
              onClick={() => reorder(index, -1)}
            >
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Move entry ${index + 1} down`}
              disabled={index === config.entries.length - 1}
              onClick={() => reorder(index, 1)}
            >
              <ArrowDown size={16} />
            </button>
          </div>
          <details>
            <summary>
              Entry {index + 1} · {chartEntryName(entry, catalog)}
            </summary>
            <fieldset
              className="chart-entry-fields"
              aria-label={`Entry ${index + 1}`}
            >
              <div className="chart-entry-actions">
                <button
                  type="button"
                  className="text-button danger-text"
                  disabled={config.entries.length === 1}
                  onClick={() =>
                    onChange({
                      ...config,
                      entries: config.entries.filter((e) => e.id !== entry.id),
                    })
                  }
                >
                  <Trash2 size={14} />
                  Remove entry
                </button>
              </div>
              <label>
                Label (optional)
                <input
                  maxLength={80}
                  placeholder="Automatic"
                  value={entry.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </label>
              <label>
                Data type
                <select
                  value={entry.source.type}
                  onChange={(e) =>
                    update(index, {
                      source: chartDefaultSource(
                        e.target.value as ChartSource["type"],
                        catalog,
                      ),
                      name: "",
                    })
                  }
                >
                  {Object.entries(sourceLabels)
                    .filter(
                      ([key]) =>
                        key !== "legacy" || entry.source.type === "legacy",
                    )
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <SourceFields
                source={entry.source}
                catalog={catalog}
                onChange={(source) => update(index, { source })}
              />
              {entry.source.type !== "legacy" && (
                <label>
                  Value
                  <select
                    value={entry.source.metric}
                    onChange={(e) =>
                      update(index, {
                        source: {
                          ...entry.source,
                          metric: e.target.value,
                        } as ChartSource,
                      })
                    }
                  >
                    {sourceMetrics[entry.source.type].map((metric) => (
                      <option key={metric} value={metric}>
                        {metricLabels[metric]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {entry.source.type === "exercise" && (
                <p className="micro">
                  One value per logged exercise: volume sums reps × weight; reps
                  and sets are totals; weight is the heaviest set or the average
                  across sets.
                </p>
              )}
              {entry.source.type === "workout" && (
                <p className="micro">
                  One value per workout. All workouts includes every workout in
                  the time range.
                </p>
              )}
              {entry.source.type === "volleyball" &&
                entry.source.metric === "setsPlayed" && (
                  <p className="micro">
                    Only matches with a recorded set count contribute.
                    Unrecorded values stay empty.
                  </p>
                )}
              <div className="form-grid">
                <label>
                  Display
                  <select
                    value={entry.display}
                    onChange={(e) =>
                      update(index, {
                        display: e.target.value as ChartEntry["display"],
                      })
                    }
                  >
                    <option value="line">Line</option>
                    <option value="dots">Dots</option>
                    <option value="bar">Bars</option>
                  </select>
                </label>
                <label>
                  Data mode
                  <select
                    value={entry.mode}
                    onChange={(e) =>
                      update(index, {
                        mode: e.target.value as ChartEntry["mode"],
                      })
                    }
                  >
                    <ChartModeOptions inherit />
                  </select>
                </label>
              </div>
              <div className="chart-entry-color">
                <label>
                  Color
                  <select
                    value={entry.color.startsWith("#") ? "custom" : entry.color}
                    onChange={(e) =>
                      update(index, {
                        color:
                          e.target.value === "custom"
                            ? chartColors[index % chartColors.length]
                            : e.target.value,
                      })
                    }
                  >
                    <option value="volume">Palette primary</option>
                    <option value="pain">Palette secondary</option>
                    <option value="custom">Custom color</option>
                  </select>
                </label>
                {entry.color.startsWith("#") && (
                  <label>
                    Custom color
                    <input
                      type="color"
                      value={entry.color}
                      onChange={(e) => update(index, { color: e.target.value })}
                    />
                  </label>
                )}
              </div>
            </fieldset>
          </details>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        disabled={config.entries.length >= 20}
        onClick={() =>
          onChange({
            ...config,
            entries: [
              ...config.entries,
              {
                id: crypto.randomUUID(),
                name: "",
                source: chartDefaultSource("exercise", catalog),
                display: "line",
                mode: "inherit",
                color: chartColors[config.entries.length % chartColors.length],
              },
            ],
          })
        }
      >
        <Plus size={16} />
        Add entry
      </button>
      <p className="micro">
        {config.entries.length} / 20 entries. Different units use separate
        labeled axes.
      </p>
    </fieldset>
  );
}
function SourceFields({
  source,
  catalog,
  onChange,
}: {
  source: ChartSource;
  catalog: ChartCatalog;
  onChange: (source: ChartSource) => void;
}) {
  if (source.type === "legacy")
    return (
      <p className="micro">
        This entry keeps your original calculation. Choose a data type to
        replace it with a new source.
      </p>
    );
  if (source.type === "volleyball")
    return (
      <label>
        Session type
        <select
          value={source.sessionType}
          onChange={(e) =>
            onChange({
              ...source,
              sessionType: e.target.value as "all" | "practice" | "match",
            })
          }
        >
          <option value="all">All sessions</option>
          <option value="practice">Practice</option>
          <option value="match">Match</option>
        </select>
      </label>
    );
  if (source.type === "measurement") {
    const options = [...catalog.measurements];
    if (
      source.target &&
      !options.some((m) => m.id === source.target && m.unit === source.unit)
    )
      options.push({ id: source.target, unit: source.unit });
    return (
      <label>
        Measurement
        <select
          required
          value={
            source.target ? JSON.stringify([source.target, source.unit]) : ""
          }
          onChange={(e) => {
            const [target, unit] = JSON.parse(e.target.value);
            onChange({ ...source, target, unit });
          }}
        >
          <option value="" disabled>
            Choose a recorded measurement
          </option>
          {options.map((m) => (
            <option
              key={JSON.stringify(m)}
              value={JSON.stringify([m.id, m.unit])}
            >
              {m.id.replace(/-/g, " ")} ({m.unit || "unitless"})
            </option>
          ))}
        </select>
      </label>
    );
  }
  const options =
    source.type === "exercise"
      ? [{ id: "*", name: "All exercises" }, ...catalog.exercises]
      : source.type === "workout"
        ? [
            { id: "*", name: "All workouts" },
            ...catalog.workouts.map((name) => ({ id: name, name })),
          ]
        : source.type === "activity"
          ? [
              { id: "*", name: "All activities" },
              ...catalog.activities.map((id) => ({
                id,
                name: id.replace(/-/g, " "),
              })),
            ]
          : [...catalog.injuries];
  if (source.target && !options.some((o) => o.id === source.target))
    options.push({ id: source.target, name: source.target.replace(/-/g, " ") });
  return (
    <label>
      {source.type === "pain" ? "Injury" : sourceLabels[source.type]}
      <select
        required
        value={source.target}
        onChange={(e) => onChange({ ...source, target: e.target.value })}
      >
        <option disabled value="">
          Choose an item
        </option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
