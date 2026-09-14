import { createMemo } from "solid-js";
import { persistedSignal, oneOf } from "../lib/persisted";
import { editingWidgets } from "./widget-layout";

export type ScrollStyle = "endless" | "load_more";

const [style, setStyle] = persistedSignal<ScrollStyle>(
  "hz-scroll-style",
  "endless",
  oneOf<ScrollStyle>("endless", "load_more"),
);

// Endless scroll is suspended while the user is arranging widgets: every feed
// gates its IntersectionObserver on this, so an infinite feed would otherwise
// keep appending posts as the user scrolls down and push the footer slot
// permanently out of reach. "load_more" keeps the explicit button, so a
// deliberate fetch is still possible mid-edit.
const effective = createMemo<ScrollStyle>(() => (editingWidgets() ? "load_more" : style()));

/** The scroll style a feed should behave as. Use this everywhere except the
 * settings form — see scrollStylePref() for the raw stored preference. */
export function useScrollStyle() { return effective; }

/** The user's stored preference, ignoring the widget-edit suspension. Only the
 * Display settings form wants this — it edits the preference itself, so it must
 * not show "load more" merely because edit mode happens to be on. */
export function scrollStylePref() { return style; }

export const setScrollStyle = setStyle;
