/**
 * Enter/exit animations on the Web Animations API — the slice of
 * solid-motionone this app used, kept call-compatible so no view changed
 * when that library went (it has no Solid 2 release).
 *
 *   <Motion.div {...scalePreset}>…</Motion.div>        enter on mount
 *   <Presence><Show when={open()}>                     + exit before removal
 *     <Motion.div {...scalePreset}>…</Motion.div>
 *   </Show></Presence>
 *   <div ref={el => animateIn(el, fadePreset)}>         enter, no component
 *
 * Animatable keys: opacity, x/y (px), scale, height, plus any CSS property
 * WAAPI takes. Durations are seconds, as in motionone.
 */
import {
  createContext, createSignal, onMount, splitProps, mergeProps,
  untrack, useContext, type JSX, type Component,
} from "solid-js";
import { Dynamic, createComponent } from "solid-js/web";
import { createSwitchTransition } from "@solid-primitives/transition-group";

type Easing = string | readonly [number, number, number, number];
type Transition = { duration?: number; easing?: Easing };
type Target = { [k: string]: string | number | Transition | undefined; transition?: Transition };
export type MotionOptions = {
  initial?: Target;
  animate?: Target;
  exit?: Target;
  transition?: Transition;
};

const TRANSFORM: Record<string, (v: number) => string> = {
  x: (v) => `translateX(${v}px)`,
  y: (v) => `translateY(${v}px)`,
  scale: (v) => `scale(${v})`,
};
const AT_REST: Record<string, number> = { x: 0, y: 0, scale: 1 };

function keyframe(t: Target): Keyframe {
  const kf: Keyframe = {};
  const tf: string[] = [];
  for (const [k, v] of Object.entries(t)) {
    if (k === "transition") continue;
    if (v === undefined || typeof v === "object") continue;
    if (k in TRANSFORM) tf.push(TRANSFORM[k](Number(v)));
    else kf[k] = typeof v === "number" && k !== "opacity" ? `${v}px` : v;
  }
  if (tf.length) kf.transform = tf.join(" ");
  return kf;
}

function timing(t: Transition | undefined, fill: FillMode): KeyframeAnimationOptions {
  const e = t?.easing;
  return {
    duration: (t?.duration ?? 0.3) * 1000,
    easing: Array.isArray(e) ? `cubic-bezier(${e.join(",")})` : (e as string | undefined) ?? "ease",
    fill,
  };
}

/** Animate `el` from `initial` to `animate`. Works before the element is attached. */
export function animateIn(el: Element, o: MotionOptions): void {
  if (!o.initial || !o.animate) return;
  // ponytail: the end state isn't committed inline — every preset ends at the
  // element's natural look (opacity 1, no offset). Persist it here if a
  // non-resting `animate` target is ever needed.
  el.animate([keyframe(o.initial), keyframe(o.animate)], timing(o.animate.transition ?? o.transition, "none"));
}

const exits = new WeakMap<Element, MotionOptions>();

function animateOut(el: Element, done: () => void): void {
  const o = exits.get(el);
  if (!o?.exit) return done();
  const cs = getComputedStyle(el);
  const from: Target = {};
  for (const k of Object.keys(o.exit)) {
    if (k === "transition") continue;
    from[k] = o.animate?.[k] ?? AT_REST[k] ?? (k === "height" ? (el as HTMLElement).offsetHeight : cs.getPropertyValue(k));
  }
  el.animate([keyframe(from), keyframe(o.exit)], timing(o.exit.transition ?? o.transition, "forwards"))
    .finished.then(done, done);
}

// false while a <Presence initial={false}> renders its first child.
const PresenceCtx = createContext<() => boolean>();

function motionElement(tag: string, props: MotionOptions & { ref?: unknown }): JSX.Element {
  const [opts, rest] = splitProps(props, ["initial", "animate", "exit", "transition", "ref"]);
  const appear = useContext(PresenceCtx);
  return createComponent(Dynamic, mergeProps(rest, {
    component: tag,
    ref(el: Element) {
      const o = untrack(() => ({ ...opts }));
      if (typeof o.ref === "function") (o.ref as (e: Element) => void)(el);
      if (o.exit) exits.set(el, o);
      if (!appear || appear()) animateIn(el, o);
    },
  }));
}

type MotionProxy = {
  [K in keyof JSX.IntrinsicElements]: Component<JSX.IntrinsicElements[K] & MotionOptions>;
};
export const Motion = new Proxy({} as MotionProxy, {
  get: (_, tag: string) => (props: MotionOptions) => motionElement(tag, props),
});

/** Keeps its (single) child in the DOM until that child's `exit` animation ends. */
export function Presence(props: { initial?: boolean; children: JSX.Element }): JSX.Element {
  const [appear, setAppear] = createSignal(props.initial ?? true);
  onMount(() => setAppear(true));
  // Provider resolves its children itself and returns that memo.
  const resolved = createComponent(PresenceCtx.Provider, {
    value: appear,
    get children() {
      return props.children;
    },
  }) as unknown as () => unknown;
  const first = () => {
    const c = resolved();
    const el = (Array.isArray(c) ? c : [c]).find((n) => n instanceof Element);
    return el as Element | undefined;
  };
  return createSwitchTransition(first, { onExit: animateOut }) as unknown as JSX.Element;
}

// ── Presets ───────────────────────────────────────────────────────────────────

/** Simple opacity fade */
export const fadePreset = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
} as const;

/** Scale + fade — dropdowns, menus, cards */
export const scalePreset = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.15 },
} as const;

/** Slide down + fade — panels opening from top, drawers */
export const slideDownPreset = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2 },
} as const;

/** Slide up + fade — sheets from bottom, toasts */
export const slideUpPreset = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: { duration: 0.2 },
} as const;

/** Slide in from left — sidebar panels */
export const slideRightPreset = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
  transition: { duration: 0.2 },
} as const;
