// GitHub-style posting-activity graph for the current page's channel.
// Backed by GET /spa/profile/:nick/activity (per-day wall-post counts,
// already filtered through item_permissions_sql server-side).

import { For, Show, createMemo, createEffect } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

interface ActivityData {
  days: number;
  since: string;
  counts: Record<string, number>;
}

async function fetchActivity(nick: string): Promise<ActivityData | null> {
  if (!nick) return null;
  const res = await apiFetch(`/spa/profile/${nick}/activity`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data as ActivityData;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Weeks of 7 days (Sun→Sat), oldest first, padded so the grid starts on a Sunday.
function buildWeeks(days: number, counts: Record<string, number>): { date: string; count: number }[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  start.setDate(start.getDate() - start.getDay()); // back up to the preceding Sunday

  const cells: { date: string; count: number }[] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const iso = isoDate(cursor);
    cells.push({ date: iso, count: counts[iso] ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function levelClass(count: number, max: number): string {
  if (count <= 0) return "bg-elevated";
  const ratio = max > 0 ? count / max : 1;
  if (ratio > 0.75) return "bg-accent";
  if (ratio > 0.5) return "bg-accent/70";
  if (ratio > 0.25) return "bg-accent/45";
  return "bg-accent/25";
}

export default function ActivityHeatmapWidget() {
  const nick = usePageNick();
  const { t } = useI18n();

  const [data] = createQueryResource("activity-heatmap", () => nick(), fetchActivity);

  const weeks = createMemo(() => buildWeeks(data()?.days ?? 371, data()?.counts ?? {}));
  const max = createMemo(() => Math.max(1, ...Object.values(data()?.counts ?? {})));
  const total = createMemo(() =>
    Object.values(data()?.counts ?? {}).reduce((a, b) => a + b, 0),
  );

  // Default to showing the most recent activity (right edge) rather than
  // the oldest (left edge) the scroll container starts at.
  let scrollRef: HTMLDivElement | undefined;
  createEffect(() => {
    weeks();
    if (scrollRef) scrollRef.scrollLeft = scrollRef.scrollWidth;
  });

  return (
    <Show when={!data.loading && data()}>
      <Card class="p-4">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
          {t("widgets.activity_heatmap")}
        </h3>

        <Show
          when={total() > 0}
          fallback={<p class="text-xs text-muted">{t("widgets.activity_heatmap_empty")}</p>}
        >
          <div ref={scrollRef} class="flex gap-[3px] overflow-x-auto">
            <For each={weeks()}>
              {(week) => (
                <div class="flex flex-col gap-[3px]">
                  <For each={week}>
                    {(day) => (
                      <div
                        class={`w-[10px] h-[10px] rounded-[2px] ${levelClass(day.count, max())}`}
                        title={`${day.count} · ${day.date}`}
                      />
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
          <p class="text-xs text-muted mt-3">
            {t("widgets.activity_heatmap_total", { count: total() })}
          </p>
        </Show>
      </Card>
    </Show>
  );
}
