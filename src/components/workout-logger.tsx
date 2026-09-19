"use client";
import { z } from "zod";
import { useState } from "react";
import { ChevronDown, Dumbbell, Plus, Save, Trash2 } from "lucide-react";
import { componentSchemas, type Instance } from "@/lib/domain/components";
import {
  label,
  payloadSchemas,
  type EventInput,
  type EventRecord,
} from "@/lib/domain/events";
import {
  standardExercises,
  defaultExercise,
  workoutEvents,
  templateInputSchema,
  type WorkoutExercise,
  type WorkoutTemplate,
  type TemplateInput,
  type CustomExercise,
} from "@/lib/domain/workouts";
import { totalSetVolume } from "@/lib/domain/operators";
import { SetEditor, When } from "./loggers";
import { number } from "./ui";

type DraftExercise = WorkoutExercise & { key: string };
function validationMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    const path = error.issues[0]?.path ?? [];
    if (path.includes("name")) return "Enter a name (1–120 characters).";
    const indexes = path.filter(
      (part): part is number => typeof part === "number",
    );
    const location = indexes.length
      ? `Exercise ${indexes[0] + 1}${indexes.length > 1 ? `, set ${indexes[1] + 1}` : ""}: `
      : "";
    if (path.includes("reps"))
      return `${location}enter a whole number of reps from 1 to 1,000.`;
    if (path.includes("weightKg"))
      return `${location}enter a weight from 0 to 2,000 kg.`;
    return "Use 1–30 exercises, with 1–100 sets in each exercise.";
  }
  return error instanceof Error ? error.message : "Check the workout details.";
}
function draftExercises(exercises: WorkoutExercise[]): DraftExercise[] {
  return structuredClone(exercises).map((e) => ({
    ...e,
    key: crypto.randomUUID(),
  }));
}
export function WorkoutLogger({
  instance,
  events,
  templates,
  customExercises,
  save,
  saveTemplate,
  createExercise,
}: {
  instance: Instance;
  events: EventRecord[];
  templates: WorkoutTemplate[];
  customExercises: CustomExercise[];
  save: (events: EventInput[]) => Promise<boolean>;
  saveTemplate: (template: TemplateInput) => Promise<boolean>;
  createExercise: (exercise: CustomExercise) => Promise<boolean>;
}) {
  const config = componentSchemas.workout_logger.parse(instance.config);
  const [exercises, setExercises] = useState(() =>
    draftExercises(config.exercises),
  );
  const [name, setName] = useState("Workout");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [exerciseChoice, setExerciseChoice] = useState("squat");
  const [customName, setCustomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [notes, setNotes] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const options = new Map<string, string>(
    standardExercises.map((e) => [e.id, e.name]),
  );
  customExercises.forEach((e) => options.set(e.id, e.name));
  // Preserve access to exercises from older logs, cards, and templates.
  for (const event of events) {
    if (event.eventType !== "exercise" || event.schemaVersion !== 1) continue;
    const parsed = payloadSchemas.exercise.safeParse(event.payload);
    if (parsed.success && !options.has(parsed.data.exerciseId))
      options.set(parsed.data.exerciseId, label(parsed.data.exerciseId));
  }
  for (const exercise of [
    ...exercises,
    ...templates.flatMap((t) => t.exercises),
  ]) {
    if (!options.has(exercise.exerciseId))
      options.set(exercise.exerciseId, label(exercise.exerciseId));
  }
  function changed() {
    setDirty(true);
    setSaved(false);
    setError("");
  }
  function loadTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    setExercises(draftExercises(template?.exercises ?? config.exercises));
    setName(template?.name ?? "Workout");
    setSelectedTemplate(id);
    setPendingTemplate(null);
    setOpen(null);
    setNotes("");
    setTime("");
    setDirty(false);
    setSaved(false);
    setError("");
    setSavingTemplate(false);
  }
  function addExercise(id: string) {
    if (exercises.length >= 30) return;
    const exercise = { ...defaultExercise(id), key: crypto.randomUUID() };
    setExercises([...exercises, exercise]);
    setOpen(exercise.key);
    changed();
  }
  const values = () =>
    exercises.map(({ exerciseId, sets }) => ({ exerciseId, sets }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const records = workoutEvents(
        name,
        values(),
        (time ? new Date(time) : new Date()).toISOString(),
        config.showNotes ? notes : "",
      );
      if (await save(records)) {
        setSaved(true);
        setDirty(false);
      } else
        setError(
          "Could not save this workout. Your entries are still here; try again.",
        );
    } catch (e) {
      setError(validationMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function storeTemplate() {
    setBusy(true);
    setError("");
    try {
      const template = templateInputSchema.parse({
        id: crypto.randomUUID(),
        name: templateName,
        version: 1,
        exercises: values(),
      });
      if (await saveTemplate(template)) {
        setSavingTemplate(false);
        setSelectedTemplate(template.id);
      } else
        setError("Could not save the template. Check its name and try again.");
    } catch (e) {
      setError(validationMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function addCustomExercise() {
    if (exercises.length >= 30 || busy) return;
    const exercise = {
      id: customName.trim().toLowerCase().replace(/\s+/g, "-"),
      name: customName.trim(),
    };
    if (!exercise.name || exercise.name.length > 80) {
      setError("Enter an exercise name (1–80 characters).");
      return;
    }
    if (
      options.has(exercise.id) ||
      [...options.values()].some(
        (n) => n.toLowerCase() === exercise.name.toLowerCase(),
      )
    ) {
      setError(
        "This exercise already exists. Choose it from the exercise list.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (await createExercise(exercise)) {
        addExercise(exercise.id);
        setCustomName("");
        setCreating(false);
      } else
        setError(
          "Could not create the exercise. Your workout is still here; try again.",
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create the exercise.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="logger workout-logger" onSubmit={submit} noValidate>
      <fieldset disabled={busy} className="workout-fields">
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
        <div className="workout-exercises">
          {exercises.map((exercise, index) => {
            const exerciseName =
              options.get(exercise.exerciseId) ?? label(exercise.exerciseId);
            const expanded = open === exercise.key;
            return (
              <div className="workout-exercise" key={exercise.key}>
                <div className="workout-exercise-heading">
                  <button
                    type="button"
                    className="exercise-toggle"
                    aria-expanded={expanded}
                    aria-controls={`exercise-${exercise.key}`}
                    onClick={() => setOpen(expanded ? null : exercise.key)}
                  >
                    <Dumbbell size={16} />
                    <span>
                      <strong>{exerciseName}</strong>
                      <small>
                        {exercise.sets.length} sets ·{" "}
                        {number(totalSetVolume(exercise.sets))} kg·reps
                      </small>
                    </span>
                    <ChevronDown
                      size={16}
                      className={expanded ? "expanded" : ""}
                    />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${exerciseName} exercise ${index + 1}`}
                    onClick={() => {
                      setExercises(
                        exercises.filter((e) => e.key !== exercise.key),
                      );
                      changed();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div
                  id={`exercise-${exercise.key}`}
                  className="workout-exercise-body"
                  role="group"
                  aria-label={`${exerciseName} sets ${index + 1}`}
                  hidden={!expanded}
                >
                  <SetEditor
                    sets={exercise.sets}
                    setSets={(sets) => {
                      setExercises(
                        exercises.map((e) =>
                          e.key === exercise.key ? { ...e, sets } : e,
                        ),
                      );
                      changed();
                    }}
                  />
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setOpen(null)}
                  >
                    Close exercise
                  </button>
                </div>
              </div>
            );
          })}
          {!exercises.length && (
            <p className="muted">Add an exercise to start this workout.</p>
          )}
        </div>
        <div className="workout-add">
          <select
            aria-label="Exercise to add"
            value={exerciseChoice}
            onChange={(e) => setExerciseChoice(e.target.value)}
          >
            {[...options].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button secondary small"
            disabled={exercises.length >= 30}
            onClick={() => addExercise(exerciseChoice)}
          >
            <Plus size={14} />
            Add exercise
          </button>
        </div>
        <button
          type="button"
          className="text-button accent"
          disabled={exercises.length >= 30}
          onClick={() => setCreating(!creating)}
        >
          Create an exercise
        </button>
        {creating && (
          <div className="workout-inline">
            <label>
              New exercise name
              <input
                maxLength={80}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addCustomExercise();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className="button secondary small"
              disabled={exercises.length >= 30}
              onClick={addCustomExercise}
            >
              Create & add
            </button>
          </div>
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
        <div className="workout-total">
          <span>Total volume</span>
          <strong>
            {number(
              exercises.reduce((sum, e) => sum + totalSetVolume(e.sets), 0),
            )}{" "}
            kg·reps
          </strong>
        </div>
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
            {busy ? "Saving…" : saved ? "Saved" : "Save workout"}
          </button>
        </div>
        {saved && (
          <button
            type="button"
            className="text-button"
            onClick={() => loadTemplate(selectedTemplate)}
          >
            Start another workout
          </button>
        )}
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
              Saves these exercises, reps, and weights for reuse. It does not
              log a workout.
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
