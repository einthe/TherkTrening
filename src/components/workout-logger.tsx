"use client";
import {
  latestForDay,
  localDay,
  isEventLocked,
} from "@/lib/domain/daily-events";
import { useLocalDay } from "./use-local-day";
import { useState } from "react";
import { Save } from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import {
  type EventInput,
  type EventRecord,
  newEvent,
  payloadSchemas,
} from "@/lib/domain/events";
import {
  exerciseCatalog,
  fromTemplate,
  withPreviousWeights,
  withoutWeights,
  workoutEvents,
  type WorkoutTemplate,
  type TemplateInput,
  type CustomExercise,
} from "@/lib/domain/workouts";
import { WorkoutEditor, draftExercises } from "./workout-editor";
import { When } from "./loggers";
import { localInput } from "./ui";
type WorkoutLoggerProps = {
  instance?: Instance;
  events: EventRecord[];
  templates: WorkoutTemplate[];
  customExercises: CustomExercise[];
  save: (events: EventInput[]) => Promise<boolean>;
  update?: (event: EventInput, expectedUpdatedAt: string) => Promise<boolean>;
  saveTemplate?: (template: TemplateInput) => Promise<boolean>;
  initialEvent?: EventRecord;
  onManageExercises?: () => void;
};
export function WorkoutLogger(props: WorkoutLoggerProps) {
  const day = useLocalDay();
  const dailyEvent = !props.initialEvent
    ? latestForDay(props.events, "workout", day)
    : undefined;
  return (
    <WorkoutForm
      key={
        props.initialEvent?.id ??
        `${day}:${dailyEvent?.id ?? "new"}:${dailyEvent?.updatedAt ?? ""}`
      }
      {...props}
      dailyEvent={dailyEvent}
      day={day}
    />
  );
}
function WorkoutForm({
  instance,
  events,
  templates,
  customExercises,
  save,
  update,
  saveTemplate,
  initialEvent,
  onManageExercises,
  dailyEvent,
  day,
}: WorkoutLoggerProps & { dailyEvent?: EventRecord; day: string }) {
  const source = initialEvent ?? dailyEvent;
  const config = instance
    ? componentSchemas.workout_logger.parse(instance.config)
    : { exercises: [], showNotes: true };
  const initial = source ? payloadSchemas.workout.parse(source.payload) : null;
  const [exercises, setExercises] = useState(() =>
    draftExercises(initial?.exercises ?? config.exercises),
  );
  const [name, setName] = useState(initial?.name ?? "Workout");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [notes, setNotes] = useState(source?.notes ?? "");
  const [time, setTime] = useState(source ? localInput(source.occurredAt) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const updatingToday = Boolean(
    dailyEvent && (!time || localDay(time) === day),
  );
  const locked = Boolean(
    source && isEventLocked(source) && (initialEvent || updatingToday),
  );
  const catalog = exerciseCatalog(customExercises, events);
  function changed() {
    setDirty(true);
    setSaved(false);
    setError("");
  }
  function loadTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    setExercises(
      draftExercises(
        withPreviousWeights(
          template ? fromTemplate(template.exercises) : config.exercises,
          events,
          time ? new Date(time).toISOString() : new Date().toISOString(),
          source?.id,
        ),
      ),
    );
    setName(template?.name ?? "Workout");
    setSelectedTemplate(id);
    setPendingTemplate(null);
    setNotes("");
    setDirty(false);
    setSaved(false);
    setError("");
    setSavingTemplate(false);
  }
  const values = () =>
    exercises.map(({ key, ...exercise }) => {
      void key;
      return exercise;
    });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || saved || locked) return;
    setBusy(true);
    setError("");
    try {
      const occurredAt =
        source && time === localInput(source.occurredAt)
          ? source.occurredAt
          : (time ? new Date(time) : new Date()).toISOString();
      const target =
        initialEvent ?? (localDay(occurredAt) === day ? dailyEvent : undefined);
      const entries = values().map((e) =>
        source && occurredAt !== source.occurredAt ? { ...e, occurredAt } : e,
      );
      let records = workoutEvents(
        name,
        entries,
        occurredAt,
        config.showNotes ? notes : (source?.notes ?? ""),
      );
      if (target)
        records = [
          newEvent("workout", records[0].payload, {
            ...records[0],
            id: target.id,
            startedAt: target.startedAt,
            endedAt: target.endedAt,
            batchId: target.batchId,
          }),
        ];
      const ok =
        !initialEvent && target
          ? await update?.(records[0], target.updatedAt)
          : await save(records);
      if (ok) {
        if (!initialEvent && localDay(occurredAt) !== day) {
          setExercises(draftExercises(initial?.exercises ?? config.exercises));
          setName(initial?.name ?? "Workout");
          setNotes(source?.notes ?? "");
          setTime(source ? localInput(source.occurredAt) : "");
          setSelectedTemplate("");
          setPendingTemplate(null);
          setSavingTemplate(false);
          setSaved(false);
          setFormEpoch((n) => n + 1);
        } else setSaved(true);
        setDirty(false);
      } else
        setError(
          "Could not save this workout. Your entries are still here; try again.",
        );
    } catch {
      setError(
        "Enter a workout name and at least one exercise. Reps must be whole numbers from 0 to 1,000; weights must be from 0 to 2,000 kg.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function storeTemplate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (
        await saveTemplate?.({
          id: crypto.randomUUID(),
          name: templateName,
          version: 2,
          exercises: withoutWeights(values()),
        })
      )
        setSavingTemplate(false);
      else
        setError("Could not save the template. Check its name and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="logger workout-logger" onSubmit={submit} noValidate>
      {dailyEvent && updatingToday && (
        <div className="daily-complete">
          <Save size={18} />
          <div>
            <strong>
              {locked
                ? "Today's workout is locked"
                : "Today's workout is saved"}
            </strong>
            <p>
              {locked
                ? "Unlock in Event history to make corrections."
                : "Changes update this workout. It locks when the day ends."}
            </p>
          </div>
        </div>
      )}
      <fieldset disabled={busy || locked} className="workout-fields">
        {!initialEvent && (
          <label>
            Saved workouts
            <select
              value={selectedTemplate}
              onChange={(e) =>
                dirty
                  ? setPendingTemplate(e.target.value)
                  : loadTemplate(e.target.value)
              }
            >
              <option value="">New workout</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {pendingTemplate !== null && (
          <div className="notice workout-confirm">
            <p>
              Replace the current workout draft? Its unsaved changes will be
              lost.
            </p>
            <button
              type="button"
              className="button secondary small"
              onClick={() => loadTemplate(pendingTemplate)}
            >
              Load workout
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setPendingTemplate(null)}
            >
              Keep editing
            </button>
          </div>
        )}
        <label>
          Workout name
          <input
            value={name}
            maxLength={120}
            onChange={(e) => {
              setName(e.target.value);
              changed();
            }}
          />
        </label>
        <WorkoutEditor
          exercises={exercises}
          onChange={(next) => {
            setExercises(next);
            changed();
          }}
          catalog={catalog}
          prepareExercise={(exercise) =>
            withPreviousWeights(
              [exercise],
              events,
              time ? new Date(time).toISOString() : new Date().toISOString(),
              source?.id,
            )[0]
          }
        />
        {onManageExercises && (
          <button
            type="button"
            className="text-button"
            onClick={onManageExercises}
          >
            Manage exercises
          </button>
        )}
        {config.showNotes && (
          <label>
            Notes (optional)
            <textarea
              value={notes}
              maxLength={4000}
              rows={2}
              onChange={(e) => {
                setNotes(e.target.value);
                changed();
              }}
            />
          </label>
        )}
        <div className="logger-footer">
          <When
            key={formEpoch}
            value={time}
            onChange={(value) => {
              setTime(value);
              changed();
            }}
          />
          <button
            className="button primary"
            disabled={!exercises.length || saved}
          >
            <Save size={15} />
            {busy
              ? "Saving…"
              : saved
                ? "Saved"
                : initialEvent || updatingToday
                  ? "Save changes"
                  : "Save workout"}
          </button>
        </div>
        {saveTemplate && (
          <button
            type="button"
            className="text-button"
            disabled={!exercises.length}
            onClick={() => {
              setTemplateName(name);
              setSavingTemplate(!savingTemplate);
            }}
          >
            Save as template
          </button>
        )}
        {savingTemplate && (
          <div className="workout-inline">
            <label>
              Template name
              <input
                maxLength={120}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void storeTemplate();
                  }
                }}
              />
            </label>
            <p className="micro">
              Saves exercises, sets, and reps. Weights are entered when you log
              a workout.
            </p>
            <button
              type="button"
              className="button secondary small"
              onClick={storeTemplate}
            >
              Save template
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setSavingTemplate(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
