"use client";
import { NumericInput } from "./numeric-input";
import { useState } from "react";
import { Plus, Minus, Check, Clock3, ArrowUpRight } from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import { totalSetVolume } from "@/lib/domain/operators";
import {
  label,
  newEvent,
  type EventInput,
  type EventRecord,
} from "@/lib/domain/events";
import { localInput, number, formatDate, formatTime } from "./ui";
type Props = {
  instance: Instance;
  events: EventRecord[];
  save: (events: EventInput[]) => Promise<boolean>;
};
export function When({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="when">
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen(!open)}
      >
        <Clock3 size={13} />
        {open
          ? "Event date & time"
          : value
            ? `${formatDate(value)} · ${formatTime(value)}`
            : "Now · change time"}
      </button>
      {open && (
        <label className="sr-label">
          Event date & time
          <input
            aria-label="Event date and time"
            type="datetime-local"
            required
            value={value || localInput()}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
      {open && value && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
        >
          Use current time
        </button>
      )}
    </div>
  );
}
export function PainLogger({ instance, save }: Props) {
  const config = componentSchemas.pain_logger.parse(instance.config);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const batchId = config.targets.length > 1 ? crypto.randomUUID() : null;
    try {
      const ok = await save(
        config.targets.map((injuryId) =>
          newEvent(
            "pain_measurement",
            { injuryId, painLevel: levels[injuryId] ?? 3 },
            {
              notes: config.showNotes ? notes || null : null,
              occurredAt: (time ? new Date(time) : new Date()).toISOString(),
              batchId,
            },
          ),
        ),
      );
      if (ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Check your inputs.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="logger">
      {config.targets.map((target) => (
        <div className="pain-target" key={target}>
          <div className="pain-value">
            <span>
              {config.targets.length > 1 ? label(target) : "Pain level"}
            </span>
            <div>
              <strong>{levels[target] ?? 3}</strong>
              <span> / 10</span>
            </div>
          </div>
          <input
            className="pain-slider"
            style={
              {
                "--progress": `${(levels[target] ?? 3) * 10}%`,
              } as React.CSSProperties
            }
            aria-label={`${label(target)} pain level`}
            aria-valuetext={`${levels[target] ?? 3} out of 10`}
            type="range"
            min="0"
            max="10"
            step="1"
            value={levels[target] ?? 3}
            onChange={(e) => {
              setLevels({ ...levels, [target]: Number(e.target.value) });
              setSaved(false);
            }}
          />
          <div className="range-labels">
            <span>0 · No pain</span>
            <span>10 · Severe</span>
          </div>
        </div>
      ))}
      {config.showNotes && (
        <label>
          Notes <span className="muted">(optional)</span>
          <textarea
            value={notes}
            maxLength={4000}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="logger-footer">
        <When value={time} onChange={setTime} />
        <button className="button primary" disabled={busy}>
          {saved ? <Check size={16} /> : <Plus size={16} />}{" "}
          {busy
            ? "Saving…"
            : saved
              ? "Saved"
              : config.targets.length > 1
                ? "Save all"
                : "Save check-in"}
        </button>
      </div>
    </form>
  );
}
export function OtherLogger({ instance, save }: Props) {
  const session = instance.componentDefinitionId === "session_logger";
  const config = session
    ? componentSchemas.session_logger.parse(instance.config)
    : componentSchemas.value_logger.parse(instance.config);
  const [time, setTime] = useState("");
  const [end, setEnd] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const occurredAt = (time ? new Date(time) : new Date()).toISOString();
      const input =
        "activityId" in config
          ? newEvent(
              "training_session",
              { activityId: config.activityId },
              {
                occurredAt,
                startedAt: end ? occurredAt : null,
                endedAt: end ? new Date(end).toISOString() : null,
                notes: notes || null,
              },
            )
          : newEvent(
              "measurement",
              {
                metricId: config.metricId,
                value: Number(value),
                unit: config.unit,
              },
              { occurredAt, notes: notes || null },
            );
      if (await save([input])) {
        setNotes("");
        setValue("");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Check your inputs.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="logger" onSubmit={submit}>
      <p className="card-description">
        {"activityId" in config
          ? label(config.activityId)
          : label(config.metricId)}
      </p>
      {"activityId" in config ? (
        <label>
          End time <span className="muted">(optional)</span>
          <input
            type="datetime-local"
            value={end}
            min={time}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      ) : (
        <label>
          Value ({config.unit})
          <input
            type="number"
            step="any"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      )}
      {config.showNotes && (
        <label>
          Notes (optional)
          <textarea
            value={notes}
            maxLength={4000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="logger-footer">
        <When value={time} onChange={setTime} />
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save entry"}
          <ArrowUpRight size={15} />
        </button>
      </div>
    </form>
  );
}

export function SetEditor({
  sets,
  setSets,
  template = false,
}: {
  template?: boolean;
  sets: { reps: number; weightKg: number }[];
  setSets: (sets: { reps: number; weightKg: number }[]) => void;
}) {
  const total = totalSetVolume(sets);
  return (
    <>
      <div className="sets-table">
        <div
          className={`set-row set-head ${template ? "template-set-row" : ""}`}
        >
          <span>SET</span>
          <span>REPS</span>
          {!template && <span>WEIGHT (KG)</span>}
          <span />
        </div>
        {sets.map((set, i) => (
          <div
            className={`set-row ${template ? "template-set-row" : ""}`}
            key={i}
          >
            <span className="set-index">{String(i + 1).padStart(2, "0")}</span>
            <NumericInput
              aria-label={`Set ${i + 1} reps`}
              type="number"
              min="0"
              max="1000"
              required
              value={set.reps}
              onValueChange={(value) =>
                setSets(
                  sets.map((s, n) => (n === i ? { ...s, reps: value } : s)),
                )
              }
            />
            {!template && (
              <NumericInput
                aria-label={`Set ${i + 1} weight`}
                type="number"
                min="0"
                max="2000"
                step="0.5"
                required
                value={set.weightKg}
                onValueChange={(value) =>
                  setSets(
                    sets.map((s, n) =>
                      n === i ? { ...s, weightKg: value } : s,
                    ),
                  )
                }
              />
            )}
            <button
              type="button"
              className="icon-button"
              disabled={sets.length === 1}
              aria-label={`Remove set ${i + 1}`}
              onClick={() => setSets(sets.filter((_, n) => n !== i))}
            >
              <Minus size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="set-actions">
        <button
          className="text-button accent"
          type="button"
          disabled={sets.length >= 100}
          onClick={() => setSets([...sets, { ...sets[sets.length - 1] }])}
        >
          <Plus size={14} /> Add set
        </button>
        {!template && (
          <span>
            {number(total)} <span className="muted">kg·reps</span>
          </span>
        )}
      </div>
    </>
  );
}
