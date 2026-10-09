import { Show, For, createSignal, createEffect, on } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { toast } from "@utsukta/spa-core/store/toast";
import { MdFillLocation_on, MdOutlineArrow_back, MdOutlineCheck, MdOutlinePerson_add } from "solid-icons/md";
import { fetchConnections, fetchProfile, type ChannelConn } from "@/modules/channel/api";
import { connectToChannel } from "@/modules/directory/connections/api";
import { PlatformIcon } from "@/shared/stream/components/PlatformIcons";
import { reveal } from "@/shared/stream/reveal";

const PAGE = 60;

function ConnectionCard(props: { conn: ChannelConn }) {
  const { t } = useI18n();
  const [connected, setConnected] = createSignal(props.conn.viewer_connected);
  const [busy, setBusy] = createSignal(false);
  const href = () => props.conn.local_nick ? `/channel/${props.conn.local_nick}` : props.conn.url;

  async function connect() {
    setBusy(true);
    try {
      await connectToChannel(props.conn.address || props.conn.url);
      setConnected(true);
      toast.success(t("directory.connected"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      // Slides up as it scrolls into view, staggered — same entrance as stream cards.
      ref={(el) => reveal(el, () => `conn:${props.conn.url}`)}
      class="group relative flex flex-col items-center text-center min-w-0 rounded-2xl bg-surface border border-rim
             px-3 pt-5 pb-3 transition-all duration-200
             hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-black/5"
    >
      <div class="relative">
        <img
          src={props.conn.photo}
          alt=""
          loading="lazy"
          class="w-18 h-18 rounded-full object-cover bg-elevated ring-1 ring-rim ring-offset-4 ring-offset-surface
                 transition-all group-hover:ring-accent/60"
        />
        <span class="absolute -bottom-0.5 -right-0.5 grid place-items-center w-6 h-6 rounded-full bg-surface border border-rim">
          <PlatformIcon url={props.conn.url} network={props.conn.network} size={14} />
        </span>
      </div>

      {/* Stretched link: the whole card opens the channel; the button below sits above it. */}
      <a
        href={href()}
        class="mt-3 w-full text-sm font-semibold text-txt truncate after:absolute after:inset-0 after:rounded-2xl"
        title={props.conn.name}
      >
        {props.conn.name}
      </a>
      <Show when={props.conn.address}>
        <p class="w-full text-[0.7rem] text-muted truncate">{props.conn.address}</p>
      </Show>

      <Show when={props.conn.description}>
        <p class="mt-2 text-xs text-muted/90 italic leading-snug line-clamp-2">{props.conn.description}</p>
      </Show>
      <Show when={props.conn.location}>
        <p class="mt-1.5 max-w-full inline-flex items-center gap-0.5 text-[0.7rem] text-muted">
          <MdFillLocation_on size={12} class="shrink-0 opacity-70" />
          <span class="truncate">{props.conn.location}</span>
        </p>
      </Show>

      <Show when={connected() !== null}>
        <div class="mt-auto pt-3 w-full">
          <div class="pt-3 border-t border-rim/70">
            <Show
              when={!connected()}
              fallback={
                <span class="inline-flex items-center gap-1 text-xs text-muted">
                  <MdOutlineCheck size={14} /> {t("directory.connected")}
                </span>
              }
            >
              <button
                type="button"
                onClick={connect}
                disabled={busy()}
                class="relative z-10 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold
                       border border-accent/50 text-accent hover:bg-accent hover:text-accent-fg
                       transition-colors disabled:opacity-50"
              >
                <MdOutlinePerson_add size={14} />
                {busy() ? t("directory.connecting") : t("directory.connect")}
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div class="flex flex-col items-center rounded-2xl bg-surface border border-rim px-3 pt-5 pb-4 animate-pulse">
      <div class="w-18 h-18 rounded-full bg-elevated" />
      <div class="mt-4 h-3 w-24 rounded bg-elevated" />
      <div class="mt-2 h-2.5 w-32 max-w-full rounded bg-elevated" />
    </div>
  );
}

// Rendered by the contentTop <Slot>, outside the route, so the nick comes from
// usePageNick() (site-config lists "viewconnections") rather than useParams().
export default function ViewConnectionsContentWidget() {
  const nick = usePageNick();
  const { t } = useI18n();

  // Same key as the contact-card widget, so a visit from the channel page is a cache hit.
  const [profile] = createQueryResource("contact-card", () => nick(), fetchProfile);
  const [data] = createQueryResource("channel-connections-all", () => nick(), (n: string) =>
    fetchConnections(n, 0, PAGE),
  );

  // Pages past the first, loaded on demand.
  const [more, setMore] = createSignal<ChannelConn[]>([]);
  const [loadingMore, setLoadingMore] = createSignal(false);
  // The slot keeps this widget mounted across /viewconnections/a → /b.
  createEffect(on(nick, () => setMore([]), { defer: true }));

  const conns = () => [...(data()?.connections ?? []), ...more()];
  const total = () => data()?.total ?? 0;

  async function loadMore() {
    if (loadingMore()) return;
    setLoadingMore(true);
    const page = await fetchConnections(nick(), conns().length, PAGE);
    setMore((prev) => [...prev, ...(page?.connections ?? [])]);
    setLoadingMore(false);
  }

  return (
    <div class="max-w-5xl mx-auto px-4 py-4 sm:py-6">
      {/* Header: the channel these connections belong to */}
      <header class="relative mb-6 sm:mb-8">
        <div class="h-24 sm:h-32 rounded-2xl overflow-hidden bg-gradient-to-br from-accent/70 via-accent/30 to-transparent">
          <Show when={profile()?.channel_cover}>
            <img src={profile()!.channel_cover} alt="" class="w-full h-full object-cover" />
          </Show>
        </div>
        <A
          href={`/channel/${nick()}`}
          class="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                 bg-black/35 text-white backdrop-blur-sm hover:bg-black/50 transition-colors"
        >
          <MdOutlineArrow_back size={14} /> {t("ui.back")}
        </A>

        <div class="flex items-start gap-3 sm:gap-4 px-2 sm:px-5">
          <Show
            when={profile()?.channel_photo_l}
            fallback={<div class="shrink-0 -mt-9 sm:-mt-11 w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-elevated ring-4 ring-base" />}
          >
            <img
              src={profile()!.channel_photo_l}
              alt=""
              class="shrink-0 -mt-9 sm:-mt-11 w-18 h-18 sm:w-22 sm:h-22 rounded-full object-cover bg-elevated ring-4 ring-base"
            />
          </Show>
          <div class="min-w-0 pt-2">
            <h1 class="text-xl sm:text-2xl font-semibold text-txt leading-tight truncate">
              {profile()?.channel_name ?? nick()}
            </h1>
            <p class="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted mt-0.5">
              {t("widgets.connections")}
              <Show when={total()}>
                <span class="ml-1.5 tabular-nums">· {total()}</span>
              </Show>
            </p>
          </div>
        </div>
      </header>

      <Show
        when={!data.loading}
        fallback={
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            <For each={Array(8)}>{() => <CardSkeleton />}</For>
          </div>
        }
      >
        <Show
          when={conns().length > 0}
          fallback={<p class="py-16 text-center text-sm text-muted">{t("directory.no_connections")}</p>}
        >
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            <For each={conns()}>{(conn) => <ConnectionCard conn={conn} />}</For>
          </div>

          <Show when={total() > conns().length}>
            <div class="mt-8 flex flex-col items-center gap-2">
              <p class="text-xs text-muted tabular-nums">{conns().length} / {total()}</p>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore()}
                class="px-5 py-2 rounded-full text-sm font-medium border border-rim bg-surface text-txt
                       hover:border-accent/50 hover:text-accent transition-colors disabled:opacity-50"
              >
                {t("channel.load_more")}
              </button>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}
