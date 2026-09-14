import { persistedSignal } from "../lib/persisted";

/** Collapsed post-body height in px; 0 = never collapse. */
export const DEFAULT_POST_HEIGHT = 310;

const clamp = (n: number) => (n <= 0 ? 0 : Math.min(Math.max(n, 100), 5000));

const [height, setHeight] = persistedSignal(
  "hz-post-height",
  DEFAULT_POST_HEIGHT,
  (raw) => (Number.isFinite(Number(raw)) ? clamp(Number(raw)) : undefined),
);

export function usePostHeight() { return height; }
export const postHeightPx = height;

export function setPostHeight(value: number) {
  setHeight(clamp(Number.isFinite(value) ? value : DEFAULT_POST_HEIGHT));
}
