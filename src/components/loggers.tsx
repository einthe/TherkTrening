"use client";
import {
  latestForDay,
  localDay,
  isEventLocked,
} from "@/lib/domain/daily-events";
import { useLocalDay } from "./use-local-day";
import { PainSliders } from "./pain-sliders";
import type { Injury } from "@/lib/domain/injuries";
import { NumericInput, useNumberCaret } from "./numeric-input";
import { useState } from "react";
import {
  Plus,
  Minus,
  Check,
  ChevronDown,
  Clock3,
  ArrowUpRight,
} from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import { totalSetVolume } from "@/lib/domain/operators";
import {
  label,
  newEvent,
  payloadSchemas,
  type EventInput,
  type EventRecord,
} from "@/lib/domain/events";
import { DateInput, localInput, number, formatDate, formatTime } from "./ui";
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
          <DateInput
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
export function PainLogger({
  instance,
  events,
  save,
  update,
  injuries,
}: Props & {
  injuries: Injury[];
  update: (event: EventInput, expectedUpdatedAt: string) => Promise<boolean>;
}) {
  const config = componentSchemas.pain_logger.parse(instance.config);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<string | null>(null);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const day = useLocalDay();
  const today = latestForDay(events, "pain_measurement", day);
  const activeToday = !time || localDay(time) === day ? today : undefined;
  const completed =
    activeToday && isEventLocked(activeToday) ? activeToday : undefined;
  const recorded = activeToday
    ? payloadSchemas.pain_measurement.safeParse(activeToday.payload)
    : null;
  const savedReadings = recorded?.success
    ? "readings" in recorded.data
      ? recorded.data.readings
      : [recorded.data]
    : [];
  const targets = [
    ...new Set([...savedReadings.map((r) => r.injuryId), ...config.targets]),
  ];
  const readings = completed
    ? savedReadings
    : targets.map((injuryId) => ({
        injuryId,
        painLevel:
          levels[injuryId] ??
          savedReadings.find((r) => r.injuryId === injuryId)?.painLevel ??
          3,
      }));
  const displayedNotes = completed
    ? (completed.notes ?? "")
    : (notes ?? activeToday?.notes ?? "");
  const [formEpoch, setFormEpoch] = useState(0);
  const [expanded, setExpanded] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || completed) return;
    setBusy(true);
    setError("");
    try {
      const occurredAt = time
        ? new Date(time).toISOString()
        : (activeToday?.occurredAt ?? new Date().toISOString());
      const input = newEvent(
        "pain_measurement",
        { name: instance.title, readings },
        {
          ...(activeToday
            ? {
                id: activeToday.id,
                startedAt: activeToday.startedAt,
                endedAt: activeToday.endedAt,
                batchId: activeToday.batchId,
              }
            : {}),
          notes: config.showNotes
            ? displayedNotes || null
            : (activeToday?.notes ?? null),
          occurredAt,
        },
      );
      const ok = activeToday
        ? await update(input, activeToday.updatedAt)
        : await save([input]);
      if (ok) {
        setExpanded(false);
        setLevels({});
        setNotes(null);
        setTime("");
        setFormEpoch((n) => n + 1);
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
    <form onSubmit={submit} className="logger pain-logger">
      {completed && (
        <button
          type="button"
          className="daily-complete pain-complete-toggle"
          aria-expanded={expanded}
          aria-controls={`pain-details-${instance.id}`}
          aria-label={
            expanded ? "Collapse pain check-in" : "Expand pain check-in"
          }
          onClick={() => setExpanded(!expanded)}
        >
          <Check size={18} />
          <span>
            <strong>Checked in today</strong>
            <span className="daily-complete-hint">
              Saved for today. Unlock in Event history to make corrections.
            </span>
          </span>
          <ChevronDown size={18} className={expanded ? "expanded" : ""} />
        </button>
      )}
      <div
        id={`pain-details-${instance.id}`}
        hidden={Boolean(completed) && !expanded}
      >
        <PainSliders
          injuries={injuries}
          readings={readings}
          disabled={busy || Boolean(completed)}
          onChange={(readings) => {
            setLevels(
              Object.fromEntries(
                readings.map((r) => [r.injuryId, r.painLevel]),
              ),
            );
          }}
        />
        {config.showNotes && (
          <label>
            Notes <span className="muted">(optional)</span>
            <textarea
              value={displayedNotes}
              disabled={busy || Boolean(completed)}
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
          <When
            key={formEpoch}
            value={time}
            onChange={(value) => {
              setTime(value);
              setError("");
            }}
          />
          <button
            className="button primary"
            disabled={busy || Boolean(completed)}
          >
            {completed ? <Check size={16} /> : <Plus size={16} />}{" "}
            {busy
              ? "Saving…"
              : completed
                ? "Done for today"
                : activeToday
                  ? "Save changes"
                  : "Save check-in"}
          </button>
        </div>
      </div>
    </form>
  );
}
export function OtherLogger({ instance, save }: Props) {
  const numberCaret = useNumberCaret();
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
          <DateInput
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
            onFocus={(e) => {
              if (value !== "" && Number(value) === 0) setValue("");
              numberCaret.onFocus(e.currentTarget);
            }}
            onPointerDown={numberCaret.onPointerDown}
            onPointerUp={numberCaret.onPointerUp}
            onBlur={() => {
              if (value === "") setValue("0");
            }}
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
