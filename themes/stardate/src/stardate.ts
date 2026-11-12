// A stardate for the top bar. No canonical real-world conversion exists; this
// is the common TNG-aligned one: 41000.0 at the start of 1987 (TNG season 1),
// +1000 per calendar year, the year's elapsed fraction as the rest. One
// decimal ≈ 53 minutes, so a minute tick is plenty.
export function stardate(d = new Date()): string {
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const frac = (d.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start);
  return (1000 * (y - 1946) + 1000 * frac).toFixed(1);
}
