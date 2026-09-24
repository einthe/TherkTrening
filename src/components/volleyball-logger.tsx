"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import {
  newEvent,
  type EventInput,
  type VolleyballSession,
} from "@/lib/domain/events";
import { When } from "./loggers";

type Ratings = { intensity: number; jumps: number };
const initialSession: VolleyballSession = {
  activityId: "volleyball",
  sessionType: "practice",
  intensity: 0,
  jumps: 0,
};

export function VolleyballFields({
  value,
  onChange,
  disabled = false,
}: {
  value: VolleyballSession;
  onChange: (value: VolleyballSession) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <label>
        Session type
        <select
          value={value.sessionType}
          disabled={disabled}
          onChange={(e) => {
            const ratings = {
              activityId: "volleyball" as const,
              intensity: value.intensity,
              jumps: value.jumps,
            };
            onChange(
              e.target.value === "match"
                ? { ...ratings, sessionType: "match", setsPlayed: 0 }
                : { ...ratings, sessionType: "practice" },
            );
          }}
        >
          <option value="practice">Practice</option>
          <option value="match">Match</option>
        </select>
      </label>
      <VolleyballRatings
        value={value}
        disabled={disabled}
        onChange={(ratings) => onChange({ ...value, ...ratings })}
      />
      {value.sessionType === "match" && (
        <div className="volleyball-ratings">
          <RatingSlider
            label="Sets played"
            value={value.setsPlayed}
            max={5}
            disabled={disabled}
            lowLabel="0 sets"
            highLabel="5 sets"
            onChange={(setsPlayed) => onChange({ ...value, setsPlayed })}
          />
        </div>
      )}
    </>
  );
}

function RatingSlider({
  label,
  value,
  max,
  disabled,
  lowLabel,
  highLabel,
  onChange,
  className = "",
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  lowLabel: string;
  highLabel: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <label className={`session-rating ${className}`}>
      <span className="rating-heading">
        <span>{label}</span>
        <span aria-hidden="true">
          <strong>{value}</strong> / {max}
        </span>
      </span>
      <input
        className="rating-slider"
        type="range"
        min="0"
        max={max}
        step="1"
        aria-label={label}
        aria-valuetext={`${value} out of ${max}`}
        style={
          { "--progress": `${(value / max) * 100}%` } as React.CSSProperties
        }
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="range-labels" aria-hidden="true">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </span>
    </label>
  );
}

export function VolleyballRatings({
  value,
  onChange,
  disabled = false,
}: {
  value: Ratings;
  onChange: (value: Ratings) => void;
  disabled?: boolean;
}) {
  return (
    <div className="volleyball-ratings">
      {(["intensity", "jumps"] as const).map((key) => (
        <RatingSlider
          key={key}
          className={key}
          label={key === "intensity" ? "Intensity" : "Jumps"}
          value={value[key]}
          max={10}
          disabled={disabled}
          lowLabel={key === "intensity" ? "0 · Low" : "0 · None"}
          highLabel="10 · Very high"
          onChange={(rating) => onChange({ ...value, [key]: rating })}
        />
      ))}
    </div>
  );
}

export function VolleyballLogger({
  instance,
  save,
}: {
  instance: Instance;
  save: (events: EventInput[]) => Promise<boolean>;
}) {
  const config = componentSchemas.volleyball_logger.parse(instance.config);
  const [session, setSession] = useState(initialSession);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [epoch, setEpoch] = useState(0);
  return (
    <form
      className="logger volleyball-logger"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const input = newEvent("training_session", session, {
            occurredAt: time
              ? new Date(time).toISOString()
              : new Date().toISOString(),
            notes: config.showNotes ? notes || null : null,
          });
          if (await save([input])) {
            setSession(initialSession);
            setTime("");
            setNotes("");
            setEpoch((n) => n + 1);
          } else
            setError(
              "Could not save this session. Your ratings are kept here.",
            );
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to save this session.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <VolleyballFields value={session} onChange={setSession} disabled={busy} />
      {config.showNotes && (
        <label>
          Notes (optional)
          <textarea
            rows={2}
            maxLength={4000}
            value={notes}
            disabled={busy}
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
        <When key={epoch} value={time} onChange={setTime} />
        <button className="button primary" disabled={busy}>
          <Plus size={16} />
          {busy ? "Saving…" : "Save volleyball"}
        </button>
      </div>
    </form>
  );
}
