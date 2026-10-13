import { createSignal } from "solid-js";

export type PlayerTab = "queue" | "lyrics" | "party";

/** The full player (a dialog over the library) and its open tab. */
const [fullOpen, setFullOpen] = createSignal(false);
const [fullTab, setFullTab] = createSignal<PlayerTab>("queue");
export { fullOpen, setFullOpen, fullTab, setFullTab };

export function openPlayer(tab?: PlayerTab): void {
  if (tab) setFullTab(tab);
  setFullOpen(true);
}
