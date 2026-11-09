// Fallback identity for an avatar with no usable photo: up to two initials,
// and a hue derived from the name so different people get different colours
// (deterministic, so the same person always gets the same one).

// The first letter or digit of each word, so "#video-calls (Element Call)"
// gives "VE" rather than "#(": channel sigils, brackets and @ never count.
// A name with no letters at all (emoji only) falls back to its first symbol.
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((c): c is string => !!c)
    .slice(0, 2)
    .map((c) => c.toUpperCase())
    .join("");
  return letters || ([...name.trim()][0] ?? "");
}

export function avatarHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return h % 360;
}
