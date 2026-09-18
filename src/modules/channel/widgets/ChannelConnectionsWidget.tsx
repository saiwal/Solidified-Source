import { Show, For, createSignal } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";

interface ChannelConn {
  name: string;
  address: string;
  photo: string;
  url: string;
  local_nick: string | null;
}

interface ConnectionsData {
  connections: ChannelConn[];
  total: number;
  hidden: boolean;
}

const PAGE = 24;

async function fetchConnections(nick: string, start = 0): Promise<ConnectionsData | null> {
  if (!nick) return null;
  const res = await apiFetch(`/spa/profile/${nick}/connections?limit=${PAGE}&start=${start}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data as ConnectionsData;
}

export default function ChannelConnectionsWidget() {
  const nick = usePageNick();
  const viewerRole = useViewerRole();
  const { t } = useI18n();

  const [data] = createQueryResource("channel-connections", () => nick(), (n: string) =>
    fetchConnections(n),
  );

  // Pages past the first, loaded on demand by "View all".
  const [more, setMore] = createSignal<ChannelConn[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);

  const conns = () => [...(data()?.connections ?? []), ...more()];
  const total = () => data()?.total ?? 0;

  async function loadMore() {
    if (loadingMore()) return;
    setLoadingMore(true);
    const page = await fetchConnections(nick(), conns().length);
    setMore((prev) => [...prev, ...(page?.connections ?? [])]);
    setLoadingMore(false);
  }

  return (
    <Show when={!data.loading && !data()?.hidden && conns().length > 0}>
      <div class="rounded-xl bg-surface border border-rim p-3">
        <div class="flex items-center justify-between mb-2.5">
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide">
            {t("widgets.connections")}
          </h3>
          <Show when={total() > conns().length}>
            <span class="text-xs text-muted">{total()}</span>
          </Show>
        </div>

        <div
          class="grid grid-cols-4 gap-1.5"
          classList={{ "max-h-80 overflow-y-auto": more().length > 0 }}
        >
          <For each={conns()}>
            {(conn) => {
              const href = conn.local_nick
                ? `/channel/${conn.local_nick}`
                : conn.url;
              return (
                <a href={href} title={conn.name} class="group flex flex-col items-center gap-0.5">
                  <img
                    src={conn.photo}
                    alt={conn.name}
                    class="w-11 h-11 rounded-full object-cover ring-1 ring-rim group-hover:ring-2 group-hover:ring-accent transition-all"
                  />
                  <span class="text-[0.625rem] text-muted leading-tight text-center w-full truncate group-hover:text-txt transition-colors">
                    {conn.name}
                  </span>
                </a>
              );
            }}
          </For>
        </div>

        <Show when={total() > conns().length}>
          <div class="mt-2.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore()}
              class="text-xs text-accent hover:underline disabled:opacity-50"
            >
              {t("widgets.view_all")} ({total()})
            </button>
            <Show when={viewerRole() === "owner"}>
              <a href="/directory/connections" class="text-xs text-muted hover:underline">
                {t("widgets.manage")}
              </a>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
