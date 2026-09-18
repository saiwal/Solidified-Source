// Deterministic per-name hue for the taxonomy widgets' "rainbow" mode, so a
// tag or category keeps the same colour across renders and across widgets.
// Paired with the `.rainbow-text` rule in src/index.css, which turns the hue
// into a colour that reads on both light and dark themes.

export function rainbowHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** Spread onto an element to colour its text by `name`, or a no-op when off. */
export function rainbowStyle(name: string, on?: boolean) {
  return on ? { "--rainbow-h": String(rainbowHue(name)) } : {};
}
