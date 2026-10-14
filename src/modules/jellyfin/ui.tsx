import { For, Show, createSignal, createEffect, on, type JSX } from "solid-js";
import { MdFillMusic_note } from "solid-icons/md";

// The control vocabulary and row skeleton moved to shared/views/ui.tsx once
// the calendar adopted the design guideline too.
export { iconBtn, primaryPill, ghostPill, SkeletonRows } from "@/shared/views/ui";

/** m:ss, or h:mm:ss from an hour up. */
export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * Like fmtTime but to a tenth of a second (m:ss.s / h:mm:ss.s), for editing
 * clip points. `hours` forces the hour field, so every point in a long film
 * reads the same way.
 */
export function fmtClock(sec: number, hours = false): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const tenths = Math.round(sec * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s = ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  return hours || h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Reads "1:02:03.4", "2:03.4" or plain seconds "123.4"; null if it isn't a time. */
export function parseClock(text: string): number | null {
  const parts = text.trim().replace(",", ".").split(":");
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  // Only the last field may carry a fraction
  if (parts.slice(0, -1).some((p) => p.includes("."))) return null;
  const n = parts.map(Number);
  const sec = n.reduce((acc, v) => acc * 60 + v, 0);
  // m and s fields past 59 aren't a clock time (plain seconds are fine)
  if (parts.length > 1 && n.slice(1).some((v) => v >= 60)) return null;
  return sec;
}

/**
 * Cover art, or a note glyph when the item has none (or the image fails).
 * The placeholder tint shows while it loads; the image fades in over it.
 */
export function Art(props: { src: string | null; class?: string }): JSX.Element {
  const [loaded, setLoaded] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  // A new picture (next track) fades in again rather than popping
  createEffect(on(() => props.src, () => { setLoaded(false); setFailed(false); }, { defer: true }));
  // Callers may round differently (artists are circles); two rounded-* would fight
  const box = () => `${/\brounded-/.test(props.class ?? "") ? "" : "rounded-lg"} bg-elevated shrink-0 ${props.class ?? ""}`;
  return (
    <Show when={props.src && !failed()}
      fallback={
        <div class={`flex items-center justify-center text-muted ${box()}`}>
          <MdFillMusic_note size={24} />
        </div>
      }>
      <div class={`relative overflow-hidden ${box()}`}>
        <img src={props.src!} alt="" loading="lazy" decoding="async"
          onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
          class={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${
            loaded() ? "opacity-100" : "opacity-0"
          }`} />
      </div>
    </Show>
  );
}

// ── Loading placeholders ──────────────────────────────────────────────────────

const bar = "rounded bg-elevated animate-pulse motion-reduce:animate-none";

/** Placeholder cards shaped like the real ones, for shelves and grids. */
export function SkeletonCards(props: { count?: number; shape?: string; wrap?: string }) {
  return (
    <For each={Array.from({ length: props.count ?? 6 })}>
      {() => (
        <div class={props.wrap ?? ""}>
          <div class={`w-full rounded-lg ${props.shape ?? "aspect-square"} ${bar}`} />
          <div class={`mt-2 h-3 w-3/4 ${bar}`} />
          <div class={`mt-1.5 h-2.5 w-1/2 ${bar}`} />
        </div>
      )}
    </For>
  );
}

export function SkeletonGrid(props: { count?: number; shape?: string }) {
  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      <SkeletonCards count={props.count ?? 10} shape={props.shape} />
    </div>
  );
}

export function SkeletonShelf(props: { landscape?: boolean }) {
  return (
    <section class="space-y-2">
      <div class={`h-4 w-32 ${bar}`} />
      <div class="flex gap-3 overflow-hidden">
        <SkeletonCards count={props.landscape ? 4 : 7}
          shape={props.landscape ? "aspect-video" : "aspect-square"}
          wrap={`shrink-0 ${props.landscape ? "w-56 sm:w-64" : "w-32 sm:w-36"}`} />
      </div>
    </section>
  );
}

