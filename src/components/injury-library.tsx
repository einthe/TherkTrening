"use client";
import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { injuryInputSchema, type Injury } from "@/lib/domain/injuries";
import type { Mutation } from "@/lib/data/repository";
import { Modal } from "./ui";

type Mutate = (mutation: Mutation, message?: string) => Promise<boolean>;

export function InjuryLibrary({
  injuries,
  mutate,
}: {
  injuries: Injury[];
  mutate: Mutate;
}) {
  const [editing, setEditing] = useState<Injury | "new" | null>(null);
  const [search, setSearch] = useState("");
  const filtered = [...injuries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((injury) =>
      `${injury.name} ${injury.notes}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  return (
    <div className="library-page">
      <div className="library-toolbar">
        <input
          aria-label="Search injuries"
          placeholder="Search injuries…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="button primary" onClick={() => setEditing("new")}>
          <Plus size={16} />
          New injury
        </button>
      </div>
      <p className="muted">
        Choose which injuries to track in your pain check-in component settings.
      </p>
      {filtered.map((injury) => (
        <section className="card library-card injury-card" key={injury.id}>
          <div>
            <h2>{injury.name}</h2>
            {injury.notes && (
              <p className="muted injury-notes">{injury.notes}</p>
            )}
          </div>
          <button
            className="button secondary small"
            aria-label={`Edit ${injury.name} injury`}
            onClick={() => setEditing(injury)}
          >
            <Pencil size={14} />
            Edit
          </button>
        </section>
      ))}
      {!filtered.length && (
        <div className="card empty-state">
          {injuries.length
            ? "No matching injuries."
            : "No injuries yet. Create one to start tracking pain."}
        </div>
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "New injury" : "Edit injury"}
          onClose={() => setEditing(null)}
        >
          <InjuryEditor
            existing={editing === "new" ? undefined : editing}
            injuries={injuries}
            mutate={mutate}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function InjuryEditor({
  existing,
  injuries,
  mutate,
  onClose,
}: {
  existing?: Injury;
  injuries: Injury[];
  mutate: Mutate;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setError("");
        const parsed = injuryInputSchema.safeParse({
          id: existing?.id ?? crypto.randomUUID(),
          name,
          notes,
        });
        if (
          !parsed.success ||
          (existing?.name.toLowerCase() !== name.trim().toLowerCase() &&
            injuries.some(
              (injury) =>
                injury.id !== existing?.id &&
                injury.name.toLowerCase() === name.trim().toLowerCase(),
            ))
        ) {
          setError(
            "Enter a unique injury name (1–80 characters) and notes of up to 4,000 characters.",
          );
          return;
        }
        setBusy(true);
        try {
          if (
            await mutate(
              {
                action: "saveInjury",
                injury: parsed.data,
                expectedUpdatedAt: existing?.updatedAt,
              },
              "Injury saved",
            )
          )
            onClose();
          else
            setError(
              "Could not save. This injury may have changed elsewhere. Your draft is kept here.",
            );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Injury name
        <input
          required
          maxLength={80}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Notes (optional)
        <textarea
          rows={5}
          maxLength={4000}
          value={notes}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {existing && (
        <p className="micro">
          Renaming keeps all recorded pain levels linked to this injury.
        </p>
      )}
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
          {busy ? "Saving…" : "Save injury"}
        </button>
      </div>
    </form>
  );
}
