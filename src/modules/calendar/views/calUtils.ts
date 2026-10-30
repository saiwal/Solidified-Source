import type { CalEvent } from "../api";

export const HOUR_H = 56; // px per hour in time grid

/** Display title; birthdays (core's update_birthdays() cron) get a cake marker. */
export function evTitle(ev: CalEvent, fallback: string): string {
  return (ev.etype === "birthday" ? "🎂 " : "") + (ev.title || fallback);
}

export function isoDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO datetime → local-timezone YYYY-MM-DD. Use for timed events to stay consistent with isoDateStr(anchor). */
export function localDay(iso: string): string {
  return isoDateStr(new Date(iso));
}

export function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

export function todayKey(): string {
  return isoDateStr(new Date());
}

export function startOfWeek(d: Date, mondayStart = false): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - (mondayStart ? (day + 6) % 7 : day));
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function weeksForMonth(year: number, month: number, mondayStart = false): string[][] {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const start = startOfWeek(firstDay, mondayStart);

  const weeks: string[][] = [];
  const cur = new Date(start);
  while (cur <= lastDay) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(isoDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * Convert a wall-clock date+time meant to be read in `timeZone` (e.g. the
 * "9:00 AM" the user typed while the Event Timezone Selection feature is set
 * to "Asia/Tokyo") into the UTC instant it represents. One pass — good enough
 * for the rare DST-transition edge case, not iterated to a fixed point.
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d, h, mi);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(utcGuess).map((p) => [p.type, p.value]),
  );
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute),
  );
  return new Date(utcGuess + (utcGuess - asIfUtc));
}

/** Inverse of zonedTimeToUtc: the wall-clock date+time an ISO instant reads as in `timeZone`. */
export function utcToZonedDateTime(iso: string, timeZone: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}

export interface SpanEv {
  event: CalEvent;
  startCol: number;
  endCol: number;
  startsBefore: boolean;
  endsAfter: boolean;
}

/** Subtract one calendar day from a YYYY-MM-DD string using UTC arithmetic. */
export function prevDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Add one calendar day to a YYYY-MM-DD string using UTC arithmetic. */
export function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Whether an event occurs on the given local-timezone calendar day (YYYY-MM-DD). */
export function eventOnDay(ev: CalEvent, day: string): boolean {
  if (ev.allDay) {
    // Use UTC date slices for all-day events (no meaningful timezone offset).
    const startD = ev.start.slice(0, 10);
    const endD = ev.end ? ev.end.slice(0, 10) : startD;
    // CalDAV uses exclusive DTEND (next day); channel events use inclusive DTEND (same day).
    const inclusiveEnd = ev.end && endD > startD ? prevDay(endD) : endD;
    return startD <= day && (inclusiveEnd < startD ? startD : inclusiveEnd) >= day;
  }
  const s = localDay(ev.start);
  const e = localDay(ev.end ?? ev.start);
  return s <= day && e >= day;
}

function fmtDayKey(dateStr: string, locale: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function fmtClockTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/**
 * Human-readable start/end label for an event row. Plain "All day" / "9:00 AM
 * → 5:00 PM" for single-day events; includes both dates once start and end
 * fall on different calendar days, so a multi-day event doesn't read as a
 * same-day one.
 */
export function fmtEventRange(ev: CalEvent, locale: string, allDayLabel: string): string {
  const startDay = ev.allDay ? ev.start.slice(0, 10) : localDay(ev.start);
  let endDay = ev.end ? (ev.allDay ? ev.end.slice(0, 10) : localDay(ev.end)) : startDay;
  // CalDAV all-day events use exclusive DTEND (next day) — normalize to inclusive.
  if (ev.allDay && ev.end && endDay > startDay) endDay = prevDay(endDay);
  const spansDays = endDay !== startDay;

  if (ev.allDay) {
    return spansDays ? `${fmtDayKey(startDay, locale)} – ${fmtDayKey(endDay, locale)}` : allDayLabel;
  }
  if (ev.nofinish || !ev.end) return fmtClockTime(ev.start, locale);
  if (!spansDays) return `${fmtClockTime(ev.start, locale)} → ${fmtClockTime(ev.end, locale)}`;
  return `${fmtDayKey(startDay, locale)}, ${fmtClockTime(ev.start, locale)} → ${fmtDayKey(endDay, locale)}, ${fmtClockTime(ev.end, locale)}`;
}

/**
 * Lay out events for a week.
 *
 * - Spanning (multi-day) events go into `lanes` for the banner / overlay bars.
 * - Single-day events go into `singleDay` for per-cell pill rendering (MonthView).
 *
 * `allInLanes = true` puts every event into `lanes`, even single-day ones —
 * used by WeekView so all-day events appear in the banner regardless of span.
 */
export function weekLayout(weekDates: string[], events: CalEvent[], allInLanes = false) {
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];

  const spanning: SpanEv[] = [];
  const singleDay = new Map<string, CalEvent[]>();

  for (const ev of events) {
    // All-day events: use UTC date slice (they have no meaningful tz offset).
    // Timed events: use local-timezone date so they match weekDates (local strings).
    const evS = ev.allDay ? ev.start.slice(0, 10) : localDay(ev.start);
    let evE = ev.end
      ? (ev.allDay ? ev.end.slice(0, 10) : localDay(ev.end))
      : evS;

    // CalDAV all-day events follow RFC 5545 and use exclusive DTEND (next day).
    // Channel all-day events use inclusive DTEND (same day). Normalize to inclusive.
    if (ev.allDay && ev.end && evE > evS) {
      evE = prevDay(evE);
    }
    // Malformed end-before-start data (e.g. a stray legacy event) shouldn't
    // vanish from the calendar — clamp to a single-day event at its start.
    if (evE < evS) evE = evS;

    if (evE < weekStart || evS > weekEnd) continue;

    const sc = evS < weekStart ? 0 : weekDates.indexOf(evS);
    const ec = evE > weekEnd ? 6 : weekDates.indexOf(evE);
    const safeEc = ec < 0 ? 6 : ec;
    const safeSc = sc < 0 ? 0 : sc;
    const startsBefore = evS < weekStart;
    const endsAfter = evE > weekEnd;

    if (allInLanes || safeSc < safeEc || startsBefore || endsAfter) {
      spanning.push({ event: ev, startCol: safeSc, endCol: safeEc, startsBefore, endsAfter });
    } else {
      const key = weekDates[safeSc];
      if (key) {
        if (!singleDay.has(key)) singleDay.set(key, []);
        singleDay.get(key)!.push(ev);
      }
    }
  }

  spanning.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));

  const lanes: SpanEv[][] = [];
  for (const ev of spanning) {
    let placed = false;
    for (const lane of lanes) {
      if (!lane.some(e => e.endCol >= ev.startCol && e.startCol <= ev.endCol)) {
        lane.push(ev); placed = true; break;
      }
    }
    if (!placed) lanes.push([ev]);
  }

  return { lanes, singleDay };
}

export function eventTopPx(isoStart: string): number {
  const d = new Date(isoStart);
  return (d.getHours() + d.getMinutes() / 60) * HOUR_H;
}

export function eventHeightPx(isoStart: string, isoEnd: string | null): number {
  if (!isoEnd) return HOUR_H;
  const dur = (new Date(isoEnd).getTime() - new Date(isoStart).getTime()) / 3_600_000;
  return Math.max(HOUR_H / 4, dur * HOUR_H);
}

export interface TimedEv {
  event: CalEvent;
  col: number;
  totalCols: number;
}

export function columnLayout(events: CalEvent[]): TimedEv[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const slotEnds: number[] = [];

  const items: TimedEv[] = sorted.map(ev => {
    const st = new Date(ev.start).getTime();
    const et = ev.end ? new Date(ev.end).getTime() : st + 3_600_000;
    let col = slotEnds.findIndex(e => e <= st);
    if (col === -1) col = slotEnds.length;
    slotEnds[col] = et;
    return { event: ev, col, totalCols: 1 };
  });

  for (const item of items) {
    const st = new Date(item.event.start).getTime();
    const et = item.event.end ? new Date(item.event.end).getTime() : st + 3_600_000;
    let max = item.col;
    for (const other of items) {
      const os = new Date(other.event.start).getTime();
      const oe = other.event.end ? new Date(other.event.end).getTime() : os + 3_600_000;
      if (os < et && oe > st) max = Math.max(max, other.col);
    }
    item.totalCols = max + 1;
  }
  return items;
}

/**
 * How an event chip is tinted: its calendar's own colour as a soft wash when
 * it has one (that colour is data, not theme), otherwise the theme accent.
 * `block` is for the time-grid blocks, which also get a leading bar.
 */
export function eventChip(ev: CalEvent, block = false): { class: string; style?: Record<string, string> } {
  const c = ev.calendarColor;
  if (c) {
    return {
      class: "",
      style: { background: c + (block ? "40" : "2e"), color: c, ...(block ? { "border-left": `3px solid ${c}` } : {}) },
    };
  }
  return { class: `bg-accent-muted text-accent-txt${block ? " border-l-[3px] border-l-accent" : ""}` };
}
