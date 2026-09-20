"use client";
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
  withoutWeights,
  workoutEvents,
  type WorkoutTemplate,
  type TemplateInput,
  type CustomExercise,
} from "@/lib/domain/workouts";
import { WorkoutEditor, draftExercises } from "./workout-editor";
import { When } from "./loggers";
import { localInput } from "./ui";
export function WorkoutLogger({
  instance,
  events,
  templates,
  customExercises,
  save,
  saveTemplate,
  initialEvent,
  onManageExercises,
}: {
  instance?: Instance;
  events: EventRecord[];
  templates: WorkoutTemplate[];
  customExercises: CustomExercise[];
  save: (events: EventInput[]) => Promise<boolean>;
  saveTemplate?: (template: TemplateInput) => Promise<boolean>;
  initialEvent?: EventRecord;
  onManageExercises?: () => void;
}) {
  const config = instance
    ? componentSchemas.workout_logger.parse(instance.config)
    : { exercises: [], showNotes: true };
  const initial = initialEvent
    ? payloadSchemas.workout.parse(initialEvent.payload)
    : null;
  const [exercises, setExercises] = useState(() =>
    draftExercises(initial?.exercises ?? config.exercises),
  );
  const [name, setName] = useState(initial?.name ?? "Workout");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [notes, setNotes] = useState(initialEvent?.notes ?? "");
  const [time, setTime] = useState(
    initialEvent ? localInput(initialEvent.occurredAt) : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
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
        template ? fromTemplate(template.exercises) : config.exercises,
      ),
    );
    setName(template?.name ?? "Workout");
    setSelectedTemplate(id);
    setPendingTemplate(null);
    setNotes("");
    setTime("");
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
    if (busy || saved) return;
    setBusy(true);
    setError("");
    try {
      const occurredAt =
        initialEvent && time === localInput(initialEvent.occurredAt)
          ? initialEvent.occurredAt
          : (time ? new Date(time) : new Date()).toISOString();
      const entries = values().map((e) =>
        initialEvent && occurredAt !== initialEvent.occurredAt
          ? { ...e, occurredAt }
          : e,
      );
      let records = workoutEvents(
        name,
        entries,
        occurredAt,
        config.showNotes ? notes : "",
      );
      if (initialEvent)
        records = [
          newEvent("workout", records[0].payload, {
            ...records[0],
            id: initialEvent.id,
            startedAt: initialEvent.startedAt,
            endedAt: initialEvent.endedAt,
            batchId: initialEvent.batchId,
          }),
        ];
      if (await save(records)) {
        setSaved(true);
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
      <fieldset disabled={busy} className="workout-fields">
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
                : initialEvent
                  ? "Save changes"
                  : "Save workout"}
          </button>
        </div>
        {saved && !initialEvent && (
          <button
            type="button"
            className="text-button"
            onClick={() => loadTemplate(selectedTemplate)}
          >
            Start another workout
          </button>
        )}
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
