"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { label } from "@/lib/domain/events";

export function PainTargets({
  targets,
  onChange,
  disabled = false,
  showTargets = true,
}: {
  targets: string[];
  onChange: (targets: string[]) => Promise<boolean>;
  disabled?: boolean;
  showTargets?: boolean;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(next: string[]) {
    setBusy(true);
    setError("");
    try {
      if (await onChange(next)) {
        setName("");
        return true;
      }
      setError(
        "Could not update your injuries. Your current sliders are unchanged.",
      );
    } catch {
      setError("Could not update your injuries. Please try again.");
    } finally {
      setBusy(false);
    }
    return false;
  }
  async function add() {
    if (busy || disabled) return;
    const target = name
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
    if (!target || target.length > 80) {
      setError("Enter an injury or body part (1–80 characters).");
      return;
    }
    if (
      targets.some((t) => t.toLowerCase().replace(/[\s_]+/g, "-") === target)
    ) {
      setError("You already track this injury or body part.");
      return;
    }
    if (targets.length >= 12) {
      setError("You can track up to 12 injuries or body parts in this card.");
      return;
    }
    await update([...targets, target]);
  }
  return (
    <div className="pain-target-editor">
      {showTargets && (
        <div className="pain-target-chips">
          {targets.map((target) => (
            <span key={target}>
              {label(target)}
              <button
                className="icon-button"
                type="button"
                aria-label={`Stop tracking ${label(target)}`}
                disabled={disabled || busy || targets.length === 1}
                onClick={() => void update(targets.filter((t) => t !== target))}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <label>
        Injury or body part
        <input
          placeholder="For example: Right shoulder"
          maxLength={80}
          value={name}
          disabled={disabled || busy || targets.length >= 12}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
        />
      </label>
      <button
        type="button"
        className="button secondary small"
        disabled={disabled || busy || targets.length >= 12}
        onClick={() => void add()}
      >
        <Plus size={14} />
        {busy ? "Adding…" : "Add injury / body part"}
      </button>
      {targets.length >= 12 && (
        <p className="micro">All 12 target slots are in use.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
