// packages/spa-core/src/lib/theme-transition.ts
//
// Cross-dissolves a colour-scheme switch. Without it every surface repaints in
// one frame, which reads as a flash — light → dark is the worst case, because
// the whole page goes from paper to ink instantly.
//
// Wrapped around the *switch*, not inside applyTheme(): applyTheme also runs at
// boot in index.tsx (before anything is painted, so a cross-fade would fade in
// from an empty document) and when a visited channel's scheme is applied on
// navigation (useChannelTheme), where the route change is already the motion —
// a whole-page snapshot there would also fight the stream's own view
// transition (reveal.ts names cards to slide them as they prepend).
//
// Two paths, both skipped under prefers-reduced-motion:
//   • View Transitions (Chrome/Edge 111+, Safari 18+, Firefox 144+): one
//     compositor-level cross-fade of the page snapshot, nothing per element.
//   • Otherwise: a short colour-only transition on every element, switched on
//     by the `hz-theme-fade` class for the duration (see index.css). Snapshot
//     APIs are cheap; this falls back to a repaint per frame, which is why it
//     is the fallback rather than the default.

/** Must stay in step with the durations in index.css. */
export const THEME_FADE_MS = 280;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export type ThemeTransitionMode = "view" | "fade" | "none";

/** Which path a switch takes. Pure so it can be tested without a DOM. */
export function themeTransitionMode(
  hasViewTransitions: boolean,
  reducedMotion: boolean,
): ThemeTransitionMode {
  if (reducedMotion) return "none";
  return hasViewTransitions ? "view" : "fade";
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Runs `apply` — which must be synchronous — as one animated step.
 *
 * With View Transitions the update has to happen *after* the old snapshot is
 * taken, so it lands a frame after this returns. Never read the resulting DOM
 * (or `getComputedStyle`) immediately after calling this.
 */
export function withThemeTransition(apply: () => void) {
  if (typeof document === "undefined") {
    apply();
    return;
  }

  const doc = document as ViewTransitionDocument;
  const mode = themeTransitionMode(
    typeof doc.startViewTransition === "function",
    prefersReducedMotion(),
  );

  if (mode === "none") {
    apply();
    return;
  }

  if (mode === "view") {
    try {
      // `finished` rejects if the update throws or the transition is skipped;
      // an ignored rejection would surface as an unhandled promise.
      doc.startViewTransition!(apply).finished.catch(() => {});
      return;
    } catch {
      // Malformed call in some browser build — take the class path instead.
    }
  }

  const root = document.documentElement;
  root.classList.add("hz-theme-fade");
  try {
    apply();
  } finally {
    // `finally` because a throwing apply would otherwise leave the class (and
    // its !important transitions) on the document for the whole session.
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => root.classList.remove("hz-theme-fade"), THEME_FADE_MS + 60);
  }
}
