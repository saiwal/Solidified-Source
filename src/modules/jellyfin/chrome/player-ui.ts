import { createSignal } from "solid-js";
import { createSyncSignal } from "@utsukta/spa-core/lib/syncSignal";

export type PlayerTab = "queue" | "lyrics" | "party";

/** The full player (a dialog over the library) and its open tab. */
const [fullOpen, setFullOpen] = createSignal(false);
const [fullTab, setFullTab] = createSignal<PlayerTab>("queue");
export { fullOpen, setFullOpen, fullTab, setFullTab };

/** Visualizer strip in the full player — per device, off by default. */
const VIS_KEY = "hz-jellyfin-visualizer";
const [visualizerOn, setVisualizer] = createSyncSignal((() => {
  try { return localStorage.getItem(VIS_KEY) === "1"; } catch { return false; }
})());
export { visualizerOn };
export function toggleVisualizer(): void {
  setVisualizer(!visualizerOn());
  try { localStorage.setItem(VIS_KEY, visualizerOn() ? "1" : "0"); } catch { /* per-session only */ }
}

export function openPlayer(tab?: PlayerTab): void {
  if (tab) setFullTab(tab);
  setFullOpen(true);
}
