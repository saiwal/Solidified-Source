import { createSignal } from "solid-js";

/** A video player is on screen — the music shortcuts (Space, arrows) stand down. */
const [videoActive, setVideoActive] = createSignal(false);
export { videoActive, setVideoActive };
