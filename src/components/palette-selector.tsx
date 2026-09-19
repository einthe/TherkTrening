"use client";

import { useSyncExternalStore } from "react";
import { Palette } from "lucide-react";
import { palettes, paletteStorageKey, parsePalette } from "@/lib/palettes";

const changeEvent = "therktrening:palette-change";
function subscribe(onChange: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === paletteStorageKey || event.key === null) {
      document.documentElement.dataset.palette = parsePalette(event.newValue);
      onChange();
    }
  }
  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function PaletteSelector() {
  const palette = useSyncExternalStore(
    subscribe,
    () => parsePalette(document.documentElement.dataset.palette),
    () => "forest",
  );
  return (
    <div className="palette-selector">
      <Palette size={16} aria-hidden="true" />
      <select
        aria-label="Color palette"
        title="Color palette"
        value={palette}
        onChange={(event) => {
          const next = parsePalette(event.target.value);
          document.documentElement.dataset.palette = next;
          try {
            localStorage.setItem(paletteStorageKey, next);
          } catch {
            // The selection still works for this visit if storage is unavailable.
          }
          window.dispatchEvent(new Event(changeEvent));
        }}
      >
        {palettes.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
