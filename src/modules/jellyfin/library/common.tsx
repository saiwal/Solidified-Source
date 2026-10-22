// Building blocks shared by the library views.
import { For, Show, Switch, Match, type JSX } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { MdFillMusic_note, MdFillArrow_back } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { imageUrl, landscapeUrl, ticksToSeconds, JellyfinError, type JellyfinSession, type JfItem } from "../api";
import { session, signOut, playList, current } from "../store";
import { fmtTime, Art, SkeletonGrid, SkeletonRows, SkeletonShelf } from "../ui";
import FavoriteButton from "./FavoriteButton";
import TrackMenu from "./TrackMenu";
import { Button } from "@ui/Button";
import { EmptyState } from "@ui/EmptyState";

// Jellyfin-side queries don't touch the hub, so a window refocus refetch is
// cheap but pointless for a library that rarely changes.
export const jfQuery = { refetchOnWindowFocus: false, staleTime: 5 * 60_000, retry: 1 } as const;

export function QueryError(props: { error: unknown }) {
  const { t } = useI18n();
  const expired = () => props.error instanceof JellyfinError && props.error.status === 401;
  return (
    <div class="py-8 text-center text-sm text-muted space-y-2">
      <p>{expired() ? t("jellyfin.err_expired") : t("jellyfin.err_load")}</p>
      <Show when={expired()}>
        <button type="button" onClick={() => { const s = session(); if (s) void signOut(s.id, true); }}
          class="text-accent hover:underline">
          {t("jellyfin.sign_in_again")}
        </button>
      </Show>
    </div>
  );
}

/** Loading placeholder shaped like what's coming. */
export function Loading(props: { kind?: "grid" | "rows" | "shelves" | "poster-grid" }) {
  return (
    <div aria-busy="true">
      <Switch fallback={<SkeletonGrid />}>
        <Match when={props.kind === "rows"}><SkeletonRows /></Match>
        <Match when={props.kind === "poster-grid"}><SkeletonGrid shape="aspect-[2/3]" /></Match>
        <Match when={props.kind === "shelves"}>
          <div class="space-y-5"><SkeletonShelf /><SkeletonShelf /><SkeletonShelf /></div>
        </Match>
      </Switch>
    </div>
  );
}

export function Empty(props: { children?: JSX.Element }) {
  const { t } = useI18n();
  return <EmptyState>{props.children ?? t("jellyfin.empty")}</EmptyState>;
}

/** Back, saying where to: "← Albums". Falls back to plain "Back". */
export function BackLink(props: { to?: string }) {
  const { t } = useI18n();
  return (
    <Button variant="ghost" size="sm" class="-ml-1" onClick={() => history.back()}>
      <MdFillArrow_back size={16} /> {props.to ?? t("jellyfin.back")}
    </Button>
  );
}

/** URL params that open an item's page; Audio has none (it plays instead). */
export function openParams(i: JfItem): Record<string, string | undefined> | null {
  const clear = { album: undefined, artist: undefined, playlist: undefined, search: undefined, item: undefined, series: undefined, watch: undefined };
  if (i.Type === "MusicAlbum") return { ...clear, album: i.Id };
  if (i.Type === "MusicArtist") return { ...clear, artist: i.Id };
  if (i.Type === "Playlist") return { ...clear, playlist: i.Id };
  if (i.Type === "Movie") return { ...clear, item: i.Id };
  if (i.Type === "Series") return { ...clear, series: i.Id };
  if (i.Type === "Episode" || i.Type === "Video" || i.Type === "MusicVideo") return { ...clear, watch: i.Id, t: undefined };
  return null;
}

function Card(props: { s: JellyfinSession; item: JfItem; onClick: () => void; landscape?: boolean }) {
  const it = () => props.item;
  const sub = () =>
    it().Type === "MusicAlbum" ? it().AlbumArtist
    : it().Type === "Audio" ? it().Artists?.join(", ") || it().AlbumArtist
    : it().Type === "Episode" ? `${it().SeriesName ?? ""}${it().ParentIndexNumber != null ? ` · S${it().ParentIndexNumber}E${it().IndexNumber}` : ""}`
    : it().Type === "Movie" || it().Type === "Series" ? (it().ProductionYear ? String(it().ProductionYear) : undefined)
    : undefined;
  const shape = () =>
    props.landscape ? "aspect-video"
    : it().Type === "MusicArtist" ? "aspect-square rounded-full"
    : it().Type === "Movie" || it().Type === "Series" ? "aspect-[2/3]"
    : it().Type === "Episode" || it().Type === "Video" || it().Type === "MusicVideo" ? "aspect-video"
    : "aspect-square";
  // Watched-so-far bar on started videos
  const progress = () => {
    const pos = it().UserData?.PlaybackPositionTicks ?? 0;
    return pos && it().RunTimeTicks ? Math.min(100, (pos / it().RunTimeTicks!) * 100) : 0;
  };
  return (
    // block w-full: a bare <button> shrinks to its content, so the image's
    // w-full measured against itself and posters rendered at natural size
    <button type="button" onClick={() => props.onClick()}
      class="block w-full text-left min-w-0 group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <div class="relative">
        <Art src={props.landscape ? landscapeUrl(props.s, it(), 480) : imageUrl(props.s, it(), 300)} class={`w-full ${shape()}`} />
        <Show when={progress() > 0}>
          <div class="absolute inset-x-1 bottom-1 h-1 rounded-full bg-black/50 overflow-hidden">
            <div class="h-full bg-accent" style={{ width: `${progress()}%` }} />
          </div>
        </Show>
      </div>
      <p class="mt-2 text-sm text-txt truncate transition-colors group-hover:text-accent-txt">{props.item.Name}</p>
      <Show when={sub()}>
        <p class="text-xs text-muted truncate">{sub()}</p>
      </Show>
    </button>
  );
}

/** Albums / artists / playlists as a cover grid. */
export function ItemGrid(props: { s: JellyfinSession; items: JfItem[] }) {
  const [, setParams] = useSearchParams();
  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-5 gap-y-7">
      <For each={props.items}>
        {(i) => <Card s={props.s} item={i} onClick={() => { const p = openParams(i); if (p) setParams(p); }} />}
      </For>
    </div>
  );
}

/** One horizontally scrolling row. Tracks play (the row as the queue); the rest open. */
export function Shelf(props: { s: JellyfinSession; title: string; items: JfItem[]; landscape?: boolean }) {
  const [, setParams] = useSearchParams();
  const tracks = () => props.items.filter((i) => i.Type === "Audio");
  return (
    <Show when={props.items.length}>
      <section class="space-y-2">
        <h3 class="text-sm font-semibold text-txt">{props.title}</h3>
        <div class="flex gap-4 overflow-x-auto pb-2 snap-x [scrollbar-width:thin]">
          <For each={props.items}>
            {(i) => (
              <div class={`shrink-0 snap-start ${props.landscape ? "w-56 sm:w-64" : "w-32 sm:w-36"}`}>
                <Card s={props.s} item={i} landscape={props.landscape} onClick={() => {
                  const p = openParams(i);
                  if (p) setParams(p);
                  else playList(props.s, tracks(), tracks().indexOf(i));
                }} />
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}

export function TrackList(props: { s: JellyfinSession; tracks: JfItem[]; showAlbum: boolean }) {
  return (
    <ol class="space-y-0.5">
      <For each={props.tracks}>
        {(tr, i) => {
          const isCurrent = () => current()?.Id === tr.Id && current()?.srv === props.s.id;
          return (
            <li class={`group flex items-center gap-1 pl-3 pr-1 py-1 rounded-xl transition-colors ${isCurrent() ? "bg-elevated/60" : "hover:bg-elevated/40"}`}>
              <button type="button" onClick={() => playList(props.s, props.tracks, i())}
                class="flex flex-1 items-center gap-3 min-w-0 text-left py-0.5">
                <span class="w-6 shrink-0 text-right text-xs text-muted">
                  <Show when={isCurrent()} fallback={props.showAlbum ? i() + 1 : (tr.IndexNumber ?? i() + 1)}>
                    <MdFillMusic_note size={14} class="inline text-accent-txt" />
                  </Show>
                </span>
                <span class="min-w-0 flex-1">
                  <span class={`block text-sm truncate ${isCurrent() ? "text-accent-txt" : "text-txt"}`}>{tr.Name}</span>
                  <Show when={props.showAlbum}>
                    <span class="block text-xs text-muted truncate">
                      {tr.Artists?.join(", ") || tr.AlbumArtist}<Show when={tr.Album}> · {tr.Album}</Show>
                    </span>
                  </Show>
                </span>
                <span class="shrink-0 text-xs text-muted tabular-nums">{fmtTime(ticksToSeconds(tr.RunTimeTicks))}</span>
              </button>
              <FavoriteButton s={props.s} item={tr} />
              <TrackMenu s={props.s} tracks={[tr]} mixSeed={tr} playOnTracks={props.tracks} start={i()} />
            </li>
          );
        }}
      </For>
    </ol>
  );
}
