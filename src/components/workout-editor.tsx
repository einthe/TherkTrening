"use client";
import { useState } from "react";
import {
  ChevronDown,
  Dumbbell,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  type WorkoutExercise,
  type CustomExercise,
  defaultExercise,
} from "@/lib/domain/workouts";
import { label } from "@/lib/domain/events";
import { totalSetVolume } from "@/lib/domain/operators";
import { SetEditor } from "./loggers";
import { number } from "./ui";
export type DraftExercise = WorkoutExercise & { key: string };
export function draftExercises(exercises: WorkoutExercise[]): DraftExercise[] {
  return structuredClone(exercises).map((e) => ({
    ...e,
    key: crypto.randomUUID(),
  }));
}
export function WorkoutEditor({
  exercises,
  onChange,
  catalog,
  template = false,
  prepareExercise = (exercise) => exercise,
}: {
  exercises: DraftExercise[];
  onChange: (exercises: DraftExercise[]) => void;
  catalog: CustomExercise[];
  template?: boolean;
  prepareExercise?: (exercise: WorkoutExercise) => WorkoutExercise;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [choice, setChoice] = useState(catalog[0]?.id ?? "squat");
  const names = new Map(catalog.map((e) => [e.id, e.name]));
  function move(index: number, direction: number) {
    const next = [...exercises];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    onChange(next);
  }
  return (
    <>
      <div className="workout-exercises">
        {exercises.map((exercise, index) => {
          const name =
            names.get(exercise.exerciseId) ?? label(exercise.exerciseId);
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
                    <strong>{name}</strong>
                    <small>
                      {exercise.sets.length} sets
                      {!template &&
                        ` · ${number(totalSetVolume(exercise.sets))} kg·reps`}
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
                  aria-label={`Remove ${name} exercise ${index + 1}`}
                  onClick={() =>
                    onChange(exercises.filter((e) => e.key !== exercise.key))
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div
                id={`exercise-${exercise.key}`}
                className="workout-exercise-body"
                role="group"
                aria-label={`${name} sets ${index + 1}`}
                hidden={!expanded}
              >
                <SetEditor
                  template={template}
                  sets={exercise.sets}
                  setSets={(sets) =>
                    onChange(
                      exercises.map((e) =>
                        e.key === exercise.key ? { ...e, sets } : e,
                      ),
                    )
                  }
                />
                {exercise.notes && <p className="micro">{exercise.notes}</p>}
                <div className="workout-row-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setOpen(null)}
                  >
                    Close exercise
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${name} earlier`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Move ${name} later`}
                    disabled={index === exercises.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!exercises.length && <p className="muted">Add an exercise to start.</p>}
      <div className="workout-add">
        <select
          aria-label="Exercise to add"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {catalog.map((e) => (
            <option value={e.id} key={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button secondary small"
          disabled={exercises.length >= 1000}
          onClick={() => {
            const exercise = {
              ...prepareExercise(defaultExercise(choice)),
              key: crypto.randomUUID(),
            };
            onChange([...exercises, exercise]);
            setOpen(exercise.key);
          }}
        >
          <Plus size={14} />
          Add exercise
        </button>
      </div>
      {!template && (
        <div className="workout-total">
          <span>Total volume</span>
          <strong>
            {number(
              exercises.reduce((sum, e) => sum + totalSetVolume(e.sets), 0),
            )}{" "}
            kg·reps
          </strong>
        </div>
      )}
    </>
  );
}
