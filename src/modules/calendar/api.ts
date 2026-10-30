// src/modules/cal/api.ts
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";

export interface CalEvent {
  id: number;
  uri: string;
  title: string;
  description: string;
  location: string;
  start: string;      // ISO-8601
  end: string | null; // ISO-8601 or null when nofinish
  allDay: boolean;
  nofinish: boolean;
  timezone: string;
  /** Core's event.etype — "birthday" rows come from its daily birthday cron. */
  etype?: string;
  rw: boolean;
  /** Channel-calendar events: false when the owner isn't the author (delete only). */
  editable?: boolean;
  plink: string;
  html: string;       // only populated for ?id= requests
  /**
   * Category names. Channel-calendar events only — these are TERM_CATEGORY rows on
   * the event's companion item, the same storage core uses, so they round-trip with
   * core's own calendar UI. Always `[]` for CalDAV events.
   */
  categories?: string[];
  /** Set for CalDAV events — used to color-code calendar pills */
  calendarColor?: string;
  calendarName?: string;
  calendarId?: number;
  author: {
    name: string;
    avatar: string;
    url: string;
  };
  /** Native (channel-calendar) events only, and only for the channel owner — audience detail for edit pre-population. */
  scope?: "public" | "private" | "custom";
  contactAllow?: string[];
  groupAllow?: string[];
  contactDeny?: string[];
  groupDeny?: string[];
}

export interface CalRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

/**
 * Fetch events for a date range (calendar feed).
 * Omit `range` to get the default upcoming-60-days window.
 */
export async function fetchEvents(
  nick: string,
  range?: CalRange,
  cat?: string,
): Promise<CalEvent[]> {
  const q = new URLSearchParams();
  if (range) {
    q.set("start", range.start);
    q.set("end", range.end);
  }
  if (cat) q.set("cat", cat);
  const qs = q.toString();
  const res = await fetch(`/spa/cal/${nick}${qs ? `?${qs}` : ""}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as CalEvent[];
}

export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  nofinish?: boolean;
  /** Browser-resolved IANA zone (e.g. "America/New_York") — display/export metadata only. */
  timezone?: string;
  /**
   * Comma-separated category names, matching core's `$_POST['categories']`.
   * Channel-calendar events only.
   */
  categories?: string;
  /** Audience — channel-calendar (native) events only, ignored for CalDAV targets. */
  scope?: "public" | "connections" | "private" | "custom";
  contact_allow?: string[];
  group_allow?: string[];
  contact_deny?: string[];
  group_deny?: string[];
  /** CalDAV calendar target. Omit (or use "channel_calendar") for the channel event table. */
  calendarId?: number;
  calendarInstanceId?: number;
}

export async function createEvent(
  input: CreateEventInput,
): Promise<{ id: number; uri: string }> {
  const token = await getCsrfToken();
  const res = await fetch("/spa/cal", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as { id: number; uri: string };
}

export interface EditEventInput {
  title: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  nofinish?: boolean;
  /** Browser-resolved IANA zone (e.g. "America/New_York") — display/export metadata only. */
  timezone?: string;
  /**
   * Comma-separated category names, matching core's `$_POST['categories']`.
   * Channel-calendar events only. Omitting the key keeps the stored categories;
   * sending `""` clears them. Any other term rows (hashtags, mentions) survive
   * either way.
   */
  categories?: string;
  /** Audience — channel-calendar (native) events only, ignored for CalDAV targets. */
  scope?: "public" | "connections" | "private" | "custom";
  contact_allow?: string[];
  group_allow?: string[];
  contact_deny?: string[];
  group_deny?: string[];
  /** For CalDAV events — identifies the target object */
  calendarId?: number;
  uri?: string;
}

export async function editEvent(
  eventId: number,
  input: EditEventInput,
): Promise<void> {
  const token = await getCsrfToken();
  const res = await fetch(`/spa/cal/${eventId}/edit`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
}

export async function deleteEvent(
  eventId: number,
  opts?: { calendarId?: number; uri?: string },
): Promise<void> {
  const token = await getCsrfToken();
  const res = await fetch(`/spa/cal/${eventId}/delete`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    },
    body: JSON.stringify(opts ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
}

export interface ImportResult {
  imported: number;
  failed: number;
}

export async function importCalendar(icalContent: string): Promise<ImportResult> {
  const token = await getCsrfToken();
  const res = await fetch("/spa/cal/import", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
    },
    body: JSON.stringify({ ical: icalContent }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as ImportResult;
}

/**
 * Fetch a single event by its numeric Hubzilla event id.
 * Returns the full event including server-rendered `html`.
 */
export async function fetchEvent(
  nick: string,
  eventId: number,
): Promise<CalEvent | null> {
  const res = await fetch(`/spa/cal/${nick}?id=${eventId}`, {
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const events = (json.data ?? []) as CalEvent[];
  return events[0] ?? null;
}
