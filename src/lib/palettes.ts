export const palettes = [
  { id: "forest", name: "Forest" },
  { id: "petrol", name: "Petrol" },
  { id: "slate", name: "Slate" },
  { id: "plum", name: "Plum" },
] as const;

export type PaletteId = (typeof palettes)[number]["id"];
export const paletteStorageKey = "therktrening-palette";
export function parsePalette(value: unknown): PaletteId {
  return palettes.find((palette) => palette.id === value)?.id ?? "forest";
}

// Apply the saved palette before paint; only registered IDs can reach the DOM.
export const paletteInitializationScript = `(() => {
  try {
    const value = localStorage.getItem(${JSON.stringify(paletteStorageKey)});
    const allowed = ${JSON.stringify(palettes.map((palette) => palette.id))};
    document.documentElement.dataset.palette = allowed.includes(value) ? value : 'forest';
  } catch { document.documentElement.dataset.palette = 'forest'; }
})();`;
