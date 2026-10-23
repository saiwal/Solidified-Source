// node --experimental-strip-types packages/spa-core/src/lib/theme-transition.test.ts
import assert from "node:assert";

let reduced = false;
(globalThis as any).matchMedia = () => ({ matches: reduced, media: "" });

const classes = new Set<string>();
(globalThis as any).document = {
  documentElement: {
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
    },
  },
};

const { withThemeTransition, themeTransitionMode, THEME_FADE_MS } = await import("./theme-transition.ts");

// Mode selection is pure: reduced motion always wins, then the API decides.
assert.equal(themeTransitionMode(true, false), "view");
assert.equal(themeTransitionMode(true, true), "none");
assert.equal(themeTransitionMode(false, false), "fade");
assert.equal(themeTransitionMode(false, true), "none");

const ran: string[] = [];

// Without the API the update runs inside the class-based colour fade.
withThemeTransition(() => ran.push("fade"));
assert.deepEqual(ran, ["fade"]);
assert(classes.has("hz-theme-fade"), "fallback must switch the colour transition on");

// ...and the class comes off afterwards, so hover/focus transitions return to
// their own durations rather than staying stuck at 300ms with !important.
await new Promise((r) => setTimeout(r, THEME_FADE_MS + 120));
assert(!classes.has("hz-theme-fade"), "fallback class must be removed again");

// With the API the update runs as the transition's callback, no class needed.
let vts = 0;
(globalThis as any).document.startViewTransition = (cb: () => void) => {
  vts++;
  cb();
  return { finished: Promise.resolve() };
};
withThemeTransition(() => ran.push("view"));
assert.equal(vts, 1);
assert.deepEqual(ran, ["fade", "view"]);
assert(!classes.has("hz-theme-fade"));

// A skipped/aborted transition rejects `finished`; that must not surface as an
// unhandled rejection (node would exit non-zero).
(globalThis as any).document.startViewTransition = (cb: () => void) => {
  cb();
  return { finished: Promise.reject(new Error("skipped")) };
};
withThemeTransition(() => ran.push("skipped"));
await new Promise((r) => setTimeout(r, 0));

// Reduced motion: applied instantly, neither a transition nor the class.
reduced = true;
vts = 0;
withThemeTransition(() => ran.push("instant"));
assert.equal(vts, 0);
assert(!classes.has("hz-theme-fade"));

assert.deepEqual(ran, ["fade", "view", "skipped", "instant"]);

console.log("theme-transition: ok");
