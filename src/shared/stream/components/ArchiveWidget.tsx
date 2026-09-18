// src/shared/stream/components/ArchiveWidget.tsx
//
// API: GET /spa/stream-widgets/archive?channel_nick=<nick>&type=<posts|articles>
// Response: { data: { archive: { year: number; count: number; months: { month: number; count: number }[] }[] } }

import { apiError } from "@utsukta/spa-core/lib/fetch";
import {
  type Component,
  createEffect,
  createSignal,
  For,
  on,
  Show,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArchiveMonth {
  month: number;
  count: number;
}
export interface ArchiveYear {
  year: number;
  count: number;
  months: ArchiveMonth[];
}
export interface ArchiveDay {
  day: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchArchive(params: {
  channelNick?: string;
  type?: "articles" | "cards" | "posts" | "notes";
}): Promise<ArchiveYear[]> {
  const url = new URL("/spa/stream-widgets/archive", window.location.origin);
  if (params.channelNick) url.searchParams.set("channel_nick", params.channelNick);
  if (params.type) url.searchParams.set("type", params.type);
  const res = await fetch(url.toString());
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  const data = json.data ?? json;
  return data.archive ?? [];
}

export async function fetchArchiveDays(params: {
  channelNick?: string;
  type?: "articles" | "cards" | "posts" | "notes";
  year: number;
  month: number;
}): Promise<ArchiveDay[]> {
  const url = new URL("/spa/stream-widgets/archive-days", window.location.origin);
  if (params.channelNick) url.searchParams.set("channel_nick", params.channelNick);
  if (params.type) url.searchParams.set("type", params.type);
  url.searchParams.set("year", String(params.year));
  url.searchParams.set("month", String(params.month));
  const res = await fetch(url.toString());
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  const data = json.data ?? json;
  return data.days ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthName(m: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, m - 1, 1));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Returns [dbegin, dend] for a given year+month (exclusive end = first of next month). */
export function monthRange(year: number, month: number): [string, string] {
  const dbegin = `${year}-${pad2(month)}-01`;
  const nextYear  = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const dend = `${nextYear}-${pad2(nextMonth)}-01`;
  return [dbegin, dend];
}

/** Parse YYYY-MM-DD → { year, month } or null. */
export function parseYearMonth(s: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return null;
  return { year: parseInt(m[1]), month: parseInt(m[2]) };
}

/** Returns [dbegin, dend] for a single calendar day (exclusive end = next day). */
export function dayRange(year: number, month: number, day: number): [string, string] {
  const dbegin = `${year}-${pad2(month)}-${pad2(day)}`;
  const next = new Date(year, month - 1, day + 1);
  const dend = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
  return [dbegin, dend];
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ArchiveSkeleton() {
  return (
    <ul class="divide-y divide-rim animate-pulse">
      <For each={[80, 60, 70]}>
        {(w) => (
          <li class="px-4 py-2.5 flex items-center gap-2">
            <div class="w-3 h-3 rounded bg-elevated shrink-0" />
            <div class="h-2.5 bg-elevated rounded" style={{ width: `${w}%` }} />
            <div class="ml-auto h-2.5 bg-elevated rounded w-6 shrink-0" />
          </li>
        )}
      </For>
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ArchiveWidgetProps {
  channelNick?: string;
  type?: "articles" | "cards" | "posts" | "notes";
  activeDbegin?: string;
  activeDend?: string;
  onMonthClick?: (year: number, month: number) => void;
  /** Card heading. Defaults to the generic "Archive". */
  title?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ArchiveWidget: Component<ArchiveWidgetProps> = (props) => {
  const { t, locale } = useI18n();

  const [remote] = createQueryResource(
    "stream-archive",
    () => ({ channelNick: props.channelNick, type: props.type }),
    fetchArchive,
  );

  createEffect(
    on(() => remote.error, (err) => {
      if (err) toast.error((err as Error).message ?? t("widgets.load_error"));
    }),
  );

  const years = (): ArchiveYear[] => remote() ?? [];

  // All years start collapsed.
  const [expanded, setExpanded] = createSignal<Set<number>>(new Set());

  const toggleYear = (year: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  };

  const activeYM = () => parseYearMonth(props.activeDbegin ?? "");

  const isActiveMonth = (year: number, month: number) => {
    const a = activeYM();
    if (!a) return false;
    const [db, de] = monthRange(year, month);
    return props.activeDbegin === db && props.activeDend === de;
  };

  return (
    <div class="bg-surface border border-rim rounded-xl overflow-hidden">
      <div class="px-4 py-3 border-b border-rim">
        <h3 class="text-sm font-semibold text-txt">{props.title ?? t("widgets.archive")}</h3>
      </div>

      <Show when={remote.loading}>
        <ArchiveSkeleton />
      </Show>

      <Show when={!remote.loading}>
        <Show
          when={years().length > 0}
          fallback={
            <p class="px-4 py-3 text-xs text-muted">{t("widgets.no_archive")}</p>
          }
        >
          <ul class="divide-y divide-rim">
            <For each={years()}>
              {(yr) => {
                const isOpen = () => expanded().has(yr.year);
                return (
                  <li>
                    {/* Year row */}
                    <button
                      type="button"
                      onClick={() => toggleYear(yr.year)}
                      class="w-full px-4 py-2.5 flex items-center gap-2 text-left
                             hover:bg-elevated transition-colors group"
                    >
                      <span
                        class="text-xs text-muted transition-transform duration-200 shrink-0"
                        style={{ transform: isOpen() ? "rotate(90deg)" : "rotate(0deg)" }}
                      >
                        ▶
                      </span>
                      <span class="flex-1 text-sm font-medium text-txt">{yr.year}</span>
                      <span class="text-xs text-muted shrink-0">{yr.count}</span>
                    </button>

                    {/* Month list */}
                    <Show when={isOpen()}>
                      <ul>
                        <For each={yr.months}>
                          {(mo) => {
                            const active = () => isActiveMonth(yr.year, mo.month);
                            return (
                              <li>
                                <button
                                  type="button"
                                  onClick={() => props.onMonthClick?.(yr.year, mo.month)}
                                  class="w-full pl-9 pr-4 py-2 flex items-center gap-2 text-left
                                         hover:bg-elevated transition-colors"
                                  classList={{ "bg-accent-muted": active() }}
                                >
                                  <span
                                    class="flex-1 text-sm transition-colors"
                                    classList={{
                                      "text-accent font-medium": active(),
                                      "text-txt": !active(),
                                    }}
                                  >
                                    {monthName(mo.month, locale())}
                                  </span>
                                  <span class="text-xs text-muted shrink-0">{mo.count}</span>
                                </button>
                              </li>
                            );
                          }}
                        </For>
                      </ul>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
};

export default ArchiveWidget;
