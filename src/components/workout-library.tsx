"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { type Mutation, type Snapshot } from "@/lib/data/repository";
import {
  exerciseCatalog,
  fromTemplate,
  withoutWeights,
  defaultExercise,
  templateInputSchema,
  customExerciseSchema,
  type WorkoutTemplate,
  type CustomExercise,
} from "@/lib/domain/workouts";
import { WorkoutEditor, draftExercises } from "./workout-editor";
import { Modal } from "./ui";
type Mutate = (mutation: Mutation, message?: string) => Promise<boolean>;
export function WorkoutLibrary({
  snapshot,
  mutate,
}: {
  snapshot: Snapshot;
  mutate: Mutate;
}) {
  const [editing, setEditing] = useState<WorkoutTemplate | "new" | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="library-page">
      <div className="library-toolbar">
        <p className="muted">
          Templates include exercises, sets, and reps. Enter weights when
          logging.
        </p>
        <button className="button primary" onClick={() => setEditing("new")}>
          <Plus size={16} />
          New template
        </button>
      </div>
      {snapshot.workoutTemplates.map((template) => (
        <section className="card library-card" key={template.id}>
          <div>
            <h2>{template.name}</h2>
            <p className="muted">
              {template.exercises.length} exercises ·{" "}
              {template.exercises.reduce((s, e) => s + e.sets.length, 0)} sets
            </p>
          </div>
          <div className="library-actions">
            <button
              className="button secondary small"
              aria-label={`Edit ${template.name} template`}
              onClick={() => setEditing(template)}
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              className="icon-button"
              aria-label={`Delete ${template.name} template`}
              onClick={() => setRemoving(template.id)}
            >
              <Trash2 size={16} />
            </button>
          </div>
          {removing === template.id && (
            <div className="workout-confirm">
              <p>Delete this template? Logged workouts will be kept.</p>
              <button
                disabled={busy}
                className="button danger small"
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (
                      await mutate(
                        {
                          action: "deleteWorkoutTemplate",
                          id: template.id,
                          expectedUpdatedAt: template.updatedAt,
                        },
                        "Template deleted",
                      )
                    )
                      setRemoving(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Delete template
              </button>
              <button
                className="button secondary small"
                onClick={() => setRemoving(null)}
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      ))}
      {!snapshot.workoutTemplates.length && (
        <div className="card empty-state">No workout templates yet.</div>
      )}
      {editing && (
        <Modal
          title={
            editing === "new" ? "New workout template" : "Edit workout template"
          }
          onClose={() => setEditing(null)}
        >
          <TemplateEditor
            key={editing === "new" ? "new" : editing.id}
            existing={editing === "new" ? undefined : editing}
            snapshot={snapshot}
            mutate={mutate}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
function TemplateEditor({
  existing,
  snapshot,
  mutate,
  onClose,
}: {
  existing?: WorkoutTemplate;
  snapshot: Snapshot;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [exercises, setExercises] = useState(() =>
    draftExercises(
      existing ? fromTemplate(existing.exercises) : [defaultExercise()],
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="workout-fields"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        const parsed = templateInputSchema.safeParse({
          id: existing?.id ?? crypto.randomUUID(),
          name,
          version: 2,
          exercises: withoutWeights(exercises),
        });
        if (!parsed.success) {
          setError(
            "Enter a name and at least one exercise, with reps from 0 to 1,000.",
          );
          return;
        }
        setBusy(true);
        try {
          if (
            await mutate(
              {
                action: "saveWorkoutTemplate",
                template: parsed.data,
                expectedUpdatedAt: existing?.updatedAt,
              },
              "Template saved",
            )
          )
            onClose();
          else
            setError(
              "Could not save. The name may already exist, or this template changed elsewhere.",
            );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="workout-fields" disabled={busy}>
        <label>
          Template name
          <input
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <WorkoutEditor
          template
          exercises={exercises}
          onChange={setExercises}
          catalog={exerciseCatalog(snapshot.customExercises, snapshot.events)}
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
export function ExerciseLibrary({
  snapshot,
  mutate,
}: {
  snapshot: Snapshot;
  mutate: Mutate;
}) {
  const [editing, setEditing] = useState<CustomExercise | "new" | null>(null);
  const [search, setSearch] = useState("");
  const catalog = exerciseCatalog(snapshot.customExercises, snapshot.events);
  return (
    <div className="library-page">
      <div className="library-toolbar">
        <input
          aria-label="Search exercises"
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="button primary" onClick={() => setEditing("new")}>
          <Plus size={16} />
          New exercise
        </button>
      </div>
      {catalog
        .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
        .map((exercise) => (
          <section className="card library-card" key={exercise.id}>
            <div>
              <h2>{exercise.name}</h2>
              {exercise.description && (
                <p className="muted">{exercise.description}</p>
              )}
            </div>
            <button
              className="button secondary small"
              aria-label={`Edit ${exercise.name} exercise`}
              onClick={() => setEditing(exercise)}
            >
              <Pencil size={14} />
              Edit
            </button>
          </section>
        ))}
      {editing && (
        <Modal
          title={editing === "new" ? "New exercise" : "Edit exercise"}
          onClose={() => setEditing(null)}
        >
          <ExerciseEditor
            key={editing === "new" ? "new" : editing.id}
            existing={editing === "new" ? undefined : editing}
            catalog={catalog}
            mutate={mutate}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}
function ExerciseEditor({
  existing,
  catalog,
  mutate,
  onClose,
}: {
  existing?: CustomExercise;
  catalog: CustomExercise[];
  mutate: Mutate;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        const id =
          existing?.id ?? name.trim().toLowerCase().replace(/\s+/g, "-");
        const parsed = customExerciseSchema.safeParse({
          id,
          name,
          description,
        });
        if (
          !parsed.success ||
          catalog.some(
            (item) =>
              item.id !== existing?.id &&
              (item.name.toLowerCase() === name.trim().toLowerCase() ||
                item.id === id),
          )
        ) {
          setError("Enter a unique exercise name (1–80 characters).");
          return;
        }
        setBusy(true);
        try {
          if (
            await mutate(
              {
                action: "saveExercise",
                exercise: parsed.data,
                expectedUpdatedAt: existing?.updatedAt,
              },
              "Exercise saved",
            )
          )
            onClose();
          else
            setError(
              "Could not save. This exercise may have changed elsewhere.",
            );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Exercise name
        <input
          value={name}
          required
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Description (optional)
        <textarea
          value={description}
          maxLength={1000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <p className="micro">
        Changes apply to your exercise library. Logged weights and reps are
        kept.
      </p>
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
          {busy ? "Saving…" : "Save exercise"}
        </button>
      </div>
    </form>
  );
}
