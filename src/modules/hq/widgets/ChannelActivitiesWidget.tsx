import { createSignal, createMemo, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { relativeTime } from "@utsukta/spa-core/lib/relativeTime";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isModuleActive } from "@utsukta/spa-core/module-registry";

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
    <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden">
      <div class="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between">
        <h3 class="text-xs font-medium uppercase tracking-wider text-muted">
          {t("hq.channel_activities")}
        </h3>
        <Show when={active()}>
          <button
            onClick={() => navigate(active()!.url)}
            class="text-xs text-accent hover:underline"
          >
            {t("hq.view_all")}
          </button>
        </Show>
      </div>

      <Show when={data.loading}>
        <div class="px-3.5 pb-3.5 space-y-2">
          <For each={[1, 2, 3]}>
            {() => <div class="h-3 bg-overlay rounded w-3/5 animate-pulse" />}
          </For>
        </div>
      </Show>

      <Show when={!data.loading && sections().length === 0}>
        <p class="px-4 py-6 text-xs text-muted text-center">
          {t("hq.ca_empty")}
        </p>
      </Show>

      <Show when={!data.loading && sections().length > 0}>
        <div class="flex border-t border-rim">
          {/* Vertical rail — labels rotated with writing-mode so seven
              sections fit a single masonry cell. */}
          <div
            role="tablist"
            class="flex flex-col shrink-0 border-r border-rim bg-elevated"
          >
            <For each={sections()}>
              {(s) => (
                <button
                  role="tab"
                  aria-selected={active()?.id === s.id}
                  onClick={() => setActiveId(s.id)}
                  class="[writing-mode:vertical-rl] rotate-180 px-1.5 py-3
                         text-[0.6875rem] font-medium uppercase tracking-wider
                         transition-colors"
                  classList={{
                    "text-txt bg-surface": active()?.id === s.id,
                    "text-muted hover:text-txt": active()?.id !== s.id,
                  }}
                >
                  {SECTION_LABEL[s.id]
                    ? t(SECTION_LABEL[s.id] as "hq.ca_photos")
                    : s.label}
                </button>
              )}
            </For>
          </div>

          <div class="flex-1 min-w-0 max-h-80 overflow-y-auto">
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
        </div>
      </Show>
    </div>
  );
}

function ItemRows(props: { items: ActivityItem[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <For each={props.items}>
      {(i, idx) => (
        <button
          onClick={() => navigate(i.url)}
          class="w-full text-left px-3.5 py-2 hover:bg-elevated transition-colors"
          classList={{ "border-b border-rim": idx() < props.items.length - 1 }}
        >
          <p class="text-sm font-medium text-txt truncate">{i.title}</p>
          <Show when={i.summary}>
            <p class="text-xs text-muted truncate">{i.summary}</p>
          </Show>
          <p class="text-xs text-muted">{relativeTime(i.edited, t)}</p>
        </button>
      )}
    </For>
  );
}
