import Shepherd from "shepherd.js";

/** A plain translator function — avoids depending on Solid context here, since
 * tours are started from event handlers, outside any reactive owner. */
export type Translate = (key: any, ...args: any[]) => string;

export interface TourStepDef {
  /** CSS selector for the element to spotlight, e.g. `[data-tour="hq.composer"]`. */
  selector: string;
  title: (t: Translate) => string;
  text: (t: Translate) => string;
  on?: "top" | "bottom" | "left" | "right";
  /** Runs just before the step is shown — usually clicking something open
   * (`document.querySelector('[data-tour="…"]')?.click()`). The step then
   * waits for `selector` to appear, so it can target a modal that doesn't
   * exist yet when the tour starts. */
  before?: () => void;
}

export interface TourDef {
  id: string;
  label: (t: Translate) => string;
  description?: (t: Translate) => string;
  /** Route to navigate to before starting, if not already there. */
  path?: string;
  steps: TourStepDef[];
}

const tours = new Map<string, TourDef>();

export function registerTour(tour: TourDef) {
  if (tours.has(tour.id)) {
    console.warn(`Tour "${tour.id}" already registered`);
    return;
  }
  tours.set(tour.id, tour);
}

export function getAllTours(): TourDef[] {
  return [...tours.values()];
}

export function getTour(id: string): TourDef | undefined {
  return tours.get(id);
}

export interface TourButtonLabels {
  back: string;
  next: string;
  done: string;
}

/** Resolves once `test()` passes, or on timeout — never rejects, since a
 * rejected `beforeShowPromise` aborts the whole Shepherd tour. */
function waitUntil(test: () => boolean, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (test() || performance.now() - started > ms) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

/** First match that actually has a layout box. A responsive layout keeps both
 * the desktop and the mobile chrome mounted (`hidden lg:flex` / `lg:hidden`),
 * so a plain `querySelector` happily returns the `display: none` one — which
 * Shepherd would then try to spotlight at zero size. */
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (el.getClientRects().length > 0) return el;
  }
  return null;
}

const waitFor = (selector: string, ms = 3000) =>
  waitUntil(() => !!findVisible(selector), ms);

/** Builds and starts a Shepherd tour, skipping any steps whose target isn't in the DOM. */
export async function startTour(id: string, t: Translate, labels: TourButtonLabels) {
  const def = tours.get(id);
  if (!def) {
    console.warn(`Tour "${id}" not found`);
    return;
  }

  // The caller may have just navigated here, and a route's widgets are lazy
  // chunks that mount several frames later — on a first visit, long after the
  // next animation frame. Wait for the first step's target before deciding
  // which steps exist, or a cold route filters every step out and nothing
  // starts. Only the first: a later target that is deliberately absent (a
  // widget removed from the layout, the mobile chrome on a desktop) must not
  // cost the tour a timeout each.
  const first = def.steps.find((s) => !s.before);
  if (first) await waitFor(first.selector, 2000);

  // A step with `before` opens its own target, so it can't be checked yet.
  const steps = def.steps.filter((s) => s.before || findVisible(s.selector));
  if (steps.length === 0) return;

  const tour = new Shepherd.Tour({
    useModalOverlay: true,
    defaultStepOptions: {
      classes: "hz-shepherd",
      scrollTo: { behavior: "smooth", block: "center" },
      cancelIcon: { enabled: true },
    },
  });

  steps.forEach((step, i) => {
    tour.addStep({
      beforeShowPromise: () => {
        step.before?.();
        return waitFor(step.selector);
      },
      // Resolved at show time, not at build time: `before` may only just have
      // opened the target, and which of a responsive pair is visible can change.
      attachTo: { element: () => findVisible(step.selector), on: step.on ?? "bottom" },
      title: step.title(t),
      text: step.text(t),
      buttons: [
        ...(i > 0 ? [{ text: labels.back, action: tour.back }] : []),
        {
          text: i === steps.length - 1 ? labels.done : labels.next,
          action: tour.next,
        },
      ],
    });
  });

  tour.start();
}
