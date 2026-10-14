// The shared motion presets, made instant under prefers-reduced-motion —
// solid-motionone doesn't look at that setting itself.
import { fadePreset, scalePreset, slideDownPreset, slideUpPreset } from "@utsukta/spa-core/lib/motion-presets";

export { Motion, Presence } from "@utsukta/spa-core/lib/motion-presets";

const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const tame = <T extends object>(p: T): T => (reduced ? { ...p, transition: { duration: 0 } } : p);

export const fade = tame(fadePreset);
export const pop = tame(scalePreset);
export const slideDown = tame(slideDownPreset);
export const slideUp = tame(slideUpPreset);
