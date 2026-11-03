import { createSignal, createMemo, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isModuleActive } from "@utsukta/spa-core/module-registry";
import { WidgetShell } from "@ui/WidgetShell";
import { EmptyState } from "@ui/EmptyState";

// ── Types & API ───────────────────────────────────────────────────────────────

interface ActivityItem {
  url: string;
  title: string;
  summary?: string;
  src?: string;
  edited: string;
}

interface ActivitySection {
  id: string;
  label: string;
  url: string;
  items: ActivityItem[];
}

async function fetchChannelActivities(): Promise<ActivitySection[]> {
  const res = await apiFetch("/spa/channel-activities");
  if (!res.ok) throw new Error(`Failed to load activity (${res.status})`);
  const json = await res.json();
  return (json.data?.sections ?? []) as ActivitySection[];
}

// Which SPA module each section belongs to — a section is hidden when its
// module is inactive (app not installed / frontend module disabled), the same
// gate QuickComposeWidget uses for its buttons. Note the files module registers
// itself as "cloud", not "files".
const SECTION_MODULE: Record<string, string> = {
  photos: "photos",
  uploads: "cloud",
  documents: "cloud",
  audio: "cloud",
  video: "cloud",
  webpages: "webpages",
  wiki: "wiki",
  articles: "articles",
  cards: "cards",
};

// Sections the SPA has its own translated label for. Anything else — a future
// addon hooking channel_activities_widget — falls back to the server's label.
const SECTION_LABEL: Record<string, string> = {
  photos: "hq.ca_photos",
  uploads: "hq.ca_uploads",
  documents: "hq.ca_documents",
  audio: "hq.ca_audio",
  video: "hq.ca_video",
  webpages: "hq.ca_webpages",
  wiki: "hq.ca_wiki",
  articles: "hq.ca_articles",
  cards: "hq.ca_cards",
};

// ── Widget ────────────────────────────────────────────────────────────────────

export default function ChannelActivitiesWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const installedApps = useInstalledApps();
  const [activeId, setActiveId] = createSignal<string | null>(null);

  const [data] = createQueryResource(
    "channel-activities",
    () => true,
    fetchChannelActivities,
  );

  const sections = createMemo(() => {
    const apps = installedApps();
    // An unmapped section id is an addon we know nothing about — show it
    // rather than silently dropping whatever the hook contributed.
    return (data() ?? []).filter(
      (s) => !SECTION_MODULE[s.id] || isModuleActive(SECTION_MODULE[s.id], apps),
    );
  });

  const active = createMemo(
    () => sections().find((s) => s.id === activeId()) ?? sections()[0],
  );

  return (
    <WidgetShell
      title={t("hq.channel_activities")}
      // Vertical rail — rotated labels so seven sections fit one masonry cell.
      tabs={
        !data.loading && sections().length > 0
          ? {
              items: sections().map((s) => ({
                id: s.id,
                label: SECTION_LABEL[s.id] ? t(SECTION_LABEL[s.id] as "hq.ca_photos") : s.label,
              })),
              active: active()?.id,
              onSelect: setActiveId,
            }
          : undefined
      }
      actions={
        active() ? (
          <button onClick={() => navigate(active()!.url)} class="text-xs text-accent hover:underline">
            {t("hq.view_all")}
          </button>
        ) : undefined
      }
    >

      <Show when={data.loading}>
        <div class="px-(--ws-px) pb-3.5 space-y-2">
          <For each={[1, 2, 3]}>
            {() => <div class="h-3 bg-overlay rounded w-3/5 animate-pulse" />}
          </For>
        </div>
      </Show>

      <Show when={!data.loading && sections().length === 0}>
        <EmptyState size="sm" class="px-(--ws-px)">
          {t("hq.ca_empty")}
        </EmptyState>
      </Show>

      <Show when={!data.loading && sections().length > 0}>
          <div class="max-h-80 overflow-y-auto">
            <Show when={active()} keyed>
              {(s) => (
                <Show
                  when={s.id === "photos"}
                  fallback={<ItemRows items={s.items} />}
                >
                  <div class="grid grid-cols-3 gap-1 p-2">
                    <For each={s.items}>
                      {(i) => (
                        <button
                          onClick={() => navigate(i.url)}
                          class="aspect-square rounded-lg overflow-hidden bg-overlay"
                          title={i.title}
                        >
                          <img
                            src={i.src}
                            alt={i.title}
                            loading="lazy"
                            class="w-full h-full object-cover"
                          />
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              )}
            </Show>
          </div>
      </Show>
    </WidgetShell>
  );
}

// Short absolute date — "Jul 30", with a year suffix once it is stale.
// Same treatment DraftsWidget gives its dates.
function formatDate(when: string): string {
  const d = new Date(when.replace(" ", "T"));
  if (isNaN(d.getTime())) return when;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

function fullDate(when: string): string {
  const d = new Date(when.replace(" ", "T"));
  return isNaN(d.getTime()) ? when : d.toLocaleString();
}

function ItemRows(props: { items: ActivityItem[] }) {
  const navigate = useNavigate();

  return (
    <For each={props.items}>
      {(i, idx) => (
        <button
          onClick={() => navigate(i.url)}
          class="w-full text-left px-(--ws-px) py-2 flex items-start justify-between gap-2.5
                 hover:bg-elevated transition-colors"
          classList={{ "border-b border-rim": idx() < props.items.length - 1 }}
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-txt truncate leading-snug">
              {i.title}
            </p>
            <Show when={i.summary}>
              <p class="text-xs text-muted truncate mt-0.5">{i.summary}</p>
            </Show>
          </div>
          <span
            class="text-[0.625rem] text-muted/60 tabular-nums shrink-0"
            title={fullDate(i.edited)}
          >
            {formatDate(i.edited)}
          </span>
        </button>
      )}
    </For>
  );
}
