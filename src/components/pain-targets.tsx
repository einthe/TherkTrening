"use client";
import type { Injury } from "@/lib/domain/injuries";

export function PainTargets({
  targets,
  injuries,
  onChange,
  disabled = false,
}: {
  targets: string[];
  injuries: Injury[];
  onChange: (targets: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="injury-picker" disabled={disabled}>
      <legend>Included injuries</legend>
      {!injuries.length && (
        <p className="muted">Create an injury in the Injuries section first.</p>
      )}
      {[...injuries]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((injury) => (
          <label className="checkbox-label" key={injury.id}>
            <input
              type="checkbox"
              checked={targets.includes(injury.id)}
              disabled={!targets.includes(injury.id) && targets.length >= 12}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...targets, injury.id]
                    : targets.filter((id) => id !== injury.id),
                )
              }
            />
            {injury.name}
          </label>
        ))}
      <p className="micro">Select 1–12 injuries. Each gets its own slider.</p>
    </fieldset>
  );
}
