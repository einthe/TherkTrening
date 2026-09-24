"use client";
import { isEventLocked } from "@/lib/domain/daily-events";
import { PainSliders } from "./pain-sliders";
import { VolleyballFields } from "./volleyball-logger";
import { injuryName, type Injury } from "@/lib/domain/injuries";
import { WorkoutLogger } from "./workout-logger";
import { NumericInput } from "./numeric-input";
import { exerciseCatalog, type CustomExercise } from "@/lib/domain/workouts";
import { Fragment, useState } from "react";
import {
  Search,
  LockKeyhole,
  LockKeyholeOpen,
  Pencil,
  Trash2,
  ArrowUpRight,
  Plus,
  Minus,
} from "lucide-react";
import {
  describeEvent,
  eventSearchText,
  eventInputSchema,
  eventNames,
  eventTypes,
  payloadSchemas,
  volleyballSessionSchema,
  type EventInput,
  type EventRecord,
} from "@/lib/domain/events";
import {
  Modal,
  DateInput,
  formatDate,
  formatDateTime,
  formatTime,
  localInput,
} from "./ui";
import { eventIcons } from "./displays";
import type { Mutation } from "@/lib/data/repository";
function painNames(event: EventRecord, injuries: Injury[]) {
  if (event.eventType !== "pain_measurement") return "";
  const payload = payloadSchemas.pain_measurement.safeParse(event.payload);
  if (!payload.success) return "";
  const readings =
    "readings" in payload.data ? payload.data.readings : [payload.data];
  return readings.map((r) => injuryName(r.injuryId, injuries)).join(" ");
}
export function EventHistory({
  events,
  injuries,
  onSelect,
}: {
  events: EventRecord[];
  injuries: Injury[];
  onSelect: (event: EventRecord) => void;
}) {
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = [...events]
    .filter(
      (e) =>
        (!type || e.eventType === type) &&
        (!from ||
          Date.parse(e.occurredAt) >= new Date(`${from}T00:00:00`).getTime()) &&
        (!to ||
          Date.parse(e.occurredAt) <=
            new Date(`${to}T23:59:59.999`).getTime()) &&
        (eventSearchText(e) + " " + painNames(e, injuries))
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    <section className="card history-card">
      <div className="history-filters">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search events"
            placeholder="Search your activity…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <label>
          Event type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All event types</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {eventNames[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <DateInput
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          To
          <DateInput
            type="date"
            min={from}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <div className="table-scroll">
        <table className="history-table">
          <thead>
            <tr>
              <th>EVENT</th>
              <th>TYPE</th>
              <th>OCCURRED</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 25, page * 25 + 25).map((e) => {
              const Icon = eventIcons[e.eventType];
              return (
                <tr key={e.id}>
                  <td>
                    <button className="event-name" onClick={() => onSelect(e)}>
                      <span className={`event-icon ${e.eventType}`}>
                        <Icon size={16} />
                      </span>
                      {describeEvent(e)}
                    </button>
                  </td>
                  <td>{eventNames[e.eventType]}</td>
                  <td>
                    {formatDate(e.occurredAt)}{" "}
                    {new Date(e.occurredAt).getFullYear()}
                    <small className="table-time">
                      {formatTime(e.occurredAt)}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`status-tag ${isEventLocked(e) ? "locked" : ""}`}
                    >
                      {isEventLocked(e) ? (
                        <LockKeyhole size={11} />
                      ) : (
                        <span className="event-dot" />
                      )}
                      {isEventLocked(e) ? "Locked" : "Editable"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View ${describeEvent(e)}`}
                      onClick={() => onSelect(e)}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <Search />
          <h3>No events found.</h3>
          <p>
            Try a different filter, or log your first event on the dashboard.
          </p>
        </div>
      )}
      <div className="pagination">
        <span>{filtered.length} events</span>
        <div>
          <button
            className="button secondary small"
            disabled={!page}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            className="button secondary small"
            disabled={(page + 1) * 25 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
export function EventDetail({
  event,
  events,
  mutate,
  customExercises,
  injuries,
  onClose,
}: {
  event: EventRecord;
  events: EventRecord[];
  customExercises: CustomExercise[];
  injuries: Injury[];
  mutate: (m: Mutation, message?: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const locked = isEventLocked(event);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(
    event.payload as Record<string, unknown>,
  );
  const [notes, setNotes] = useState(event.notes ?? "");
  const [time, setTime] = useState(localInput(event.occurredAt));
  const [start, setStart] = useState(
    event.startedAt ? localInput(event.startedAt) : "",
  );
  const [end, setEnd] = useState(
    event.endedAt ? localInput(event.endedAt) : "",
  );
  const [parent, setParent] = useState(event.parentEventId ?? "");
  async function action(m: Mutation, message: string) {
    setBusy(true);
    try {
      if (await mutate(m, message)) {
        setError("");
        if (m.action !== "lockEvent" || m.locked) onClose();
      } else
        setError(
          "This change could not be saved. The event may have changed elsewhere. Close and reload before trying again.",
        );
    } finally {
      setBusy(false);
    }
  }
  function field(key: string, value: unknown) {
    setPayload({ ...payload, [key]: value });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const input: EventInput = eventInputSchema.parse({
        id: event.id,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        occurredAt:
          time === localInput(event.occurredAt)
            ? event.occurredAt
            : new Date(time).toISOString(),
        startedAt: start
          ? event.startedAt && start === localInput(event.startedAt)
            ? event.startedAt
            : new Date(start).toISOString()
          : null,
        endedAt: end
          ? event.endedAt && end === localInput(event.endedAt)
            ? event.endedAt
            : new Date(end).toISOString()
          : null,
        parentEventId: parent || null,
        batchId: event.batchId,
        payload,
        notes: notes || null,
      });
      await action(
        {
          action: "editEvent",
          event: input,
          expectedUpdatedAt: event.updatedAt,
        },
        "Event updated",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your inputs.");
    }
  }
  const workout =
    event.eventType === "workout"
      ? payloadSchemas.workout.safeParse(event.payload)
      : null;
  const pain =
    event.eventType === "pain_measurement"
      ? payloadSchemas.pain_measurement.safeParse(payload)
      : null;
  const recordedPain =
    event.eventType === "pain_measurement"
      ? payloadSchemas.pain_measurement.safeParse(event.payload)
      : null;
  const catalog = exerciseCatalog(customExercises, events);
  const volleyball =
    event.eventType === "training_session"
      ? volleyballSessionSchema.safeParse(payload)
      : null;
  const sets = payload.sets as { reps: number; weightKg: number }[] | undefined;
  return (
    <Modal
      title={
        editing
          ? event.eventType === "workout"
            ? "Edit workout"
            : "Edit event"
          : describeEvent(event)
      }
      subtitle={`${eventNames[event.eventType]} · ${formatDate(event.occurredAt)} at ${formatTime(event.occurredAt)}`}
      onClose={onClose}
    >
      {editing && event.eventType === "workout" ? (
        <WorkoutLogger
          initialEvent={event}
          events={events}
          templates={[]}
          customExercises={customExercises}
          save={async ([input]) => {
            const ok = await mutate(
              {
                action: "editEvent",
                event: input,
                expectedUpdatedAt: event.updatedAt,
              },
              "Workout updated",
            );
            if (ok) onClose();
            return ok;
          }}
        />
      ) : editing ? (
        <form onSubmit={save} className="settings-form">
          <label>
            Occurred at
            <DateInput
              type="datetime-local"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          {["injuryId", "exerciseId", "activityId", "metricId", "name", "unit"]
            .filter(
              (k) =>
                k in payload &&
                !(k === "activityId" && volleyball?.success) &&
                !(k === "name" && event.eventType === "pain_measurement"),
            )
            .map((k) => (
              <label key={k}>
                {
                  (
                    {
                      injuryId: "Injury ID",
                      exerciseId: "Exercise ID",
                      activityId: "Activity ID",
                      metricId: "Metric ID",
                      name: "Workout name",
                      unit: "Unit",
                    } as Record<string, string>
                  )[k]
                }
                <input
                  required={k !== "unit"}
                  value={String(payload[k])}
                  onChange={(e) => field(k, e.target.value)}
                />
              </label>
            ))}
          {volleyball?.success && (
            <VolleyballFields
              value={volleyball.data}
              disabled={busy}
              onChange={(session) => setPayload(session)}
            />
          )}
          {pain?.success && "readings" in pain.data && (
            <PainSliders
              injuries={injuries}
              readings={pain.data.readings}
              disabled={busy}
              onChange={(readings) => field("readings", readings)}
            />
          )}
          {"painLevel" in payload && (
            <label>
              Pain level (0–10)
              <NumericInput
                type="number"
                min="0"
                max="10"
                step="0.1"
                required
                value={Number(payload.painLevel)}
                onValueChange={(value) => field("painLevel", value)}
              />
            </label>
          )}
          {"value" in payload && (
            <label>
              Value
              <NumericInput
                type="number"
                step="any"
                required
                value={Number(payload.value)}
                onValueChange={(value) => field("value", value)}
              />
            </label>
          )}
          {sets && (
            <div>
              <div className="set-row set-head">
                <span>SET</span>
                <span>REPS</span>
                <span>WEIGHT (KG)</span>
                <span />
              </div>
              {sets.map((s, i) => (
                <div className="set-row" key={i}>
                  <span>{i + 1}</span>
                  <NumericInput
                    aria-label={`Edit set ${i + 1} reps`}
                    type="number"
                    min="0"
                    max="1000"
                    value={s.reps}
                    onValueChange={(value) =>
                      field(
                        "sets",
                        sets.map((r, n) =>
                          n === i ? { ...r, reps: value } : r,
                        ),
                      )
                    }
                  />
                  <NumericInput
                    aria-label={`Edit set ${i + 1} weight`}
                    type="number"
                    min="0"
                    max="2000"
                    step="0.5"
                    value={s.weightKg}
                    onValueChange={(value) =>
                      field(
                        "sets",
                        sets.map((r, n) =>
                          n === i ? { ...r, weightKg: value } : r,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove edit set ${i + 1}`}
                    disabled={sets.length === 1}
                    className="icon-button"
                    onClick={() =>
                      field(
                        "sets",
                        sets.filter((_, n) => n !== i),
                      )
                    }
                  >
                    <Minus size={15} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button accent"
                onClick={() => field("sets", [...sets, { ...sets.at(-1)! }])}
              >
                <Plus size={14} />
                Add set
              </button>
              <label>
                Parent workout
                <select
                  value={parent}
                  onChange={(e) => setParent(e.target.value)}
                >
                  <option value="">No workout</option>
                  {events
                    .filter((e) => e.eventType === "workout")
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {(e.payload as { name: string }).name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
          <div className="form-grid">
            <label>
              Start (optional)
              <DateInput
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              End (optional)
              <DateInput
                type="datetime-local"
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <label>
            Notes (optional)
            <textarea
              value={notes}
              maxLength={4000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(false)}
            >
              Cancel edit
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="event-detail">
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <dl>
              <dt>Occurred</dt>
              <dd>{formatDateTime(event.occurredAt)}</dd>
              <dt>Saved</dt>
              <dd>{formatDateTime(event.createdAt)}</dd>
              <dt>Status</dt>
              <dd>
                {locked
                  ? "Locked — protected from edits and deletion"
                  : "Unlocked"}
              </dd>
              {event.startedAt && (
                <>
                  <dt>Start</dt>
                  <dd>{formatDateTime(event.startedAt)}</dd>
                </>
              )}
              {event.endedAt && (
                <>
                  <dt>End</dt>
                  <dd>{formatDateTime(event.endedAt)}</dd>
                </>
              )}
              {event.parentEventId && (
                <>
                  <dt>Workout</dt>
                  <dd>
                    {(
                      events.find((e) => e.id === event.parentEventId)
                        ?.payload as { name: string }
                    )?.name ?? event.parentEventId}
                  </dd>
                </>
              )}
              {event.batchId && (
                <>
                  <dt>Batch</dt>
                  <dd className="mono">{event.batchId}</dd>
                </>
              )}
            </dl>
            {volleyball?.success && (
              <dl>
                <dt>Session type</dt>
                <dd>
                  {volleyball.data.sessionType === "match"
                    ? "Match"
                    : "Practice"}
                </dd>
                {volleyball.data.sessionType === "match" && (
                  <>
                    <dt>Sets played</dt>
                    <dd>{volleyball.data.setsPlayed}</dd>
                  </>
                )}
                <dt>Intensity</dt>
                <dd>{volleyball.data.intensity}/10</dd>
                <dt>Jumps</dt>
                <dd>{volleyball.data.jumps}/10</dd>
              </dl>
            )}
            {recordedPain?.success && (
              <dl>
                {("readings" in recordedPain.data
                  ? recordedPain.data.readings
                  : [recordedPain.data]
                ).map((reading) => (
                  <Fragment key={reading.injuryId}>
                    <dt>{injuryName(reading.injuryId, injuries)}</dt>
                    <dd>{reading.painLevel}/10</dd>
                  </Fragment>
                ))}
              </dl>
            )}
            {workout?.success && (
              <div className="workout-exercises">
                {workout.data.exercises?.map((exercise, index) => (
                  <div className="workout-inline" key={index}>
                    <strong>
                      {catalog.find((e) => e.id === exercise.exerciseId)
                        ?.name ?? exercise.exerciseId.replace(/-/g, " ")}
                    </strong>
                    {exercise.sets.map((set, i) => (
                      <span key={i}>
                        Set {i + 1}: {set.reps} reps × {set.weightKg} kg
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {event.notes && <blockquote>{event.notes}</blockquote>}
            <details>
              <summary>Recorded data · schema v{event.schemaVersion}</summary>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          </div>
          {deleting ? (
            <div className="delete-confirm">
              <p>Delete this event permanently?</p>
              <button
                className="button secondary"
                onClick={() => setDeleting(false)}
              >
                Keep event
              </button>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  action(
                    {
                      action: "deleteEvent",
                      id: event.id,
                      expectedUpdatedAt: event.updatedAt,
                    },
                    "Event deleted",
                  )
                }
              >
                Delete event
              </button>
            </div>
          ) : (
            <div className="modal-actions spread">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  action(
                    {
                      action: "lockEvent",
                      id: event.id,
                      locked: !locked,
                      expectedUpdatedAt: event.updatedAt,
                    },
                    locked ? "Event unlocked" : "Event locked",
                  )
                }
              >
                {locked ? (
                  <LockKeyholeOpen size={15} />
                ) : (
                  <LockKeyhole size={15} />
                )}
                {locked ? "Unlock event" : "Lock event"}
              </button>
              <div>
                <button
                  className="icon-button danger-text"
                  aria-label="Delete event"
                  disabled={locked || busy}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={17} />
                </button>
                <button
                  className="button primary"
                  disabled={
                    locked ||
                    busy ||
                    event.schemaVersion !== 1 ||
                    !payloadSchemas[event.eventType]?.safeParse(event.payload)
                      .success
                  }
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={15} />
                  {event.eventType === "workout"
                    ? "Edit workout"
                    : "Edit event"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
