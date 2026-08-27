import { createSignal } from "solid-js";

/** Collapsed post-body height in px; 0 = never collapse. */
export const DEFAULT_POST_HEIGHT = 310;

const clamp = (n: number) => (n <= 0 ? 0 : Math.min(Math.max(n, 100), 5000));

const [height, setHeightGlobal] = createSignal(
  clamp(Number(localStorage.getItem("hz-post-height") ?? DEFAULT_POST_HEIGHT))
);

export function usePostHeight() { return height; }
export const postHeightPx = height;

export function setPostHeight(value: number) {
  const px = clamp(Number.isFinite(value) ? value : DEFAULT_POST_HEIGHT);
  setHeightGlobal(px);
  localStorage.setItem("hz-post-height", String(px));
}
