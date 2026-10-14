// src/modules/cal/store.ts
//
// Module-level singleton — survives navigation.
// Guard loadCalendar() with events().length === 0 only when the nick hasn't
// changed; a nick change always triggers a fresh fetch.

import { createSignal } from "solid-js";
import { fetchEvents } from "./api";
import { toast } from "@utsukta/spa-core/store/toast";
import type { CalEvent, CalRange } from "./api";

// ── nick ──────────────────────────────────────────────────────────────────────
const [nick, setNick] = createSignal("");
export { nick };

// ── event list ────────────────────────────────────────────────────────────────
const [events, setEvents] = createSignal<CalEvent[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [loaded, setLoaded] = createSignal(false);

export { events, loading, error };

// ── current range (drives the "month" the user is viewing) ───────────────────
const [range, setRange] = createSignal<CalRange | undefined>(undefined);
export { range };

// ── view + anchor date ────────────────────────────────────────────────────────
// Shared by the header (Month/Week/Day/List switcher) and the content widget
// (period label, prev/next, the grid itself).
export type ViewType = "month" | "week" | "day" | "list";
export const [viewType, setViewType] = createSignal<ViewType>("month");
export const [anchor, setAnchor] = createSignal(new Date());

// ── selected event (detail panel) ────────────────────────────────────────────
const [selectedEvent, setSelectedEvent] = createSignal<CalEvent | null>(null);
export { selectedEvent, setSelectedEvent };

// ── refresh trigger ───────────────────────────────────────────────────────────
// Increment this from the widget after toggling a calendar; CalView tracks it
// and forces a re-fetch so the toggled calendar appears / disappears.
const [calendarRefreshVersion, setCalendarRefreshVersion] = createSignal(0);
export { calendarRefreshVersion };
export function bumpCalendarRefresh() {
  setCalendarRefreshVersion((v) => v + 1);
}

// ── actions ───────────────────────────────────────────────────────────────────

export function resetCal() {
  setEvents([]);
  setError(null);
  setRange(undefined);
  setSelectedEvent(null);
  setLoaded(false);
}

/**
 * Load events for `nickname`, optionally within a date range.
 * Always resets when the nick changes.
 */
export async function loadCalendar(
  nickname: string,
  newRange?: CalRange,
  force = false,
): Promise<void> {
  const nickChanged = nickname !== nick();

  // Avoid re-fetching the same nick + range pair (even when empty)
  if (
    !force &&
    !nickChanged &&
    loaded() &&
    rangesEqual(newRange, range())
  ) {
    return;
  }

  if (nickChanged) {
    setNick(nickname);
    setEvents([]);
    setSelectedEvent(null);
  }

  setRange(newRange);
  setLoading(true);
  setError(null);

  try {
    const data = await fetchEvents(nickname, newRange);
    setEvents(data);
    setLoaded(true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load calendar";
    setError(msg);
    toast.error(msg);
  } finally {
    setLoading(false);
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function rangesEqual(a?: CalRange, b?: CalRange): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

/**
 * Derive the month boundaries (YYYY-MM-DD) for a given year/month.
 * Feed these into loadCalendar() to drive month navigation.
 */
export function monthRange(year: number, month: number): CalRange {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end   = new Date(Date.UTC(year, month, 1)); // exclusive: first day of NEXT month
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}
