// Library pages: the tabbed browser (Home / Albums / Artists / Playlists /
// Movies / Shows / Favourites) and the album, artist, playlist, movie, series,
// player and search pages.
import { createMemo, createSignal, createEffect, For, Show, Switch, Match, type JSX } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { useQuery, useInfiniteQuery } from "@tanstack/solid-query";
import { MdFillPlay_arrow, MdFillShuffle, MdFillRadio, MdOutlineSort, MdFillArrow_upward, MdFillArrow_downward } from "solid-icons/md";
import { useSort } from "./sort";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  listAlbums, listArtists, listAlbumTracks, getItem, search, imageUrl, PAGE_SIZE,
  recentlyAdded, recentlyAddedVideo, recentlyPlayed, mostPlayed, listFavorites, listPlaylists, playlistItems,
  libraries, isVideoLibrary, listLibrary, seasons, episodes, resumeVideos, nextUp, ticksToSeconds,
  type JellyfinSession, type JfItem, type JfPage, type Sort,
} from "../api";
import { playList, shuffled, toggleShuffle } from "../store";
import { Art, ghostPill, primaryPill, iconBtn } from "../ui";
import { useSection } from "../chrome/section";
import { jfQuery, QueryError, Loading, Empty, BackLink, ItemGrid, Shelf, TrackList } from "./common";
import { SkeletonShelf } from "../ui";
import { Motion, fade } from "../anim";
import FavoriteButton from "./FavoriteButton";
import TrackMenu from "./TrackMenu";
import { startMix } from "./mix";
import ShareButton from "../share";
import VideoPlayer, { videoTitle } from "../video/VideoPlayer";

const key = (s: JellyfinSession, ...rest: unknown[]) => ["jellyfin", s.server, s.userId, ...rest];

export function Browser(props: { s: JellyfinSession }) {
  const [params] = useSearchParams();
  const p = (k: string) => String(params[k] ?? "");

  // Any navigation inside the library remounts the view, which fades it in.
  // (?t= is left out: a seek-start shouldn't restart the player.)
  const viewKey = () => ["watch", "item", "series", "album", "artist", "playlist", "search", "view"].map(p).join("|");
  return (
    <Show when={viewKey()} keyed>
    {(_key) => <Motion.div {...fade}>
    <Switch fallback={<Library s={props.s} />}>
      {/* keyed: a new ?watch= must tear the old stream down, not reuse it */}
      <Match when={p("watch")} keyed>
        {(id) => <VideoPlayer s={props.s} id={id} startAt={params.t ? Number(params.t) : undefined} />}
      </Match>
      <Match when={p("item")}>{(id) => <MovieDetail s={props.s} id={id()} />}</Match>
      <Match when={p("series")}>{(id) => <SeriesDetail s={props.s} id={id()} />}</Match>
      <Match when={p("album")}>{(id) => <AlbumDetail s={props.s} id={id()} />}</Match>
      <Match when={p("artist")}>{(id) => <ArtistDetail s={props.s} id={id()} />}</Match>
      <Match when={p("playlist")}>{(id) => <PlaylistDetail s={props.s} id={id()} />}</Match>
      <Match when={p("search")}>{(q) => <SearchResults s={props.s} term={q()} />}</Match>
    </Switch>
    </Motion.div>}
    </Show>
  );
}

/**
 * Music tabs are fixed views across every music library. Video tabs mirror the
 * server: one per video library ("lib:<id>"), named as the server names it.
 */
type Tab = "home" | "albums" | "artists" | "playlists" | "favorites" | `lib:${string}`;
const MUSIC_TABS: Tab[] = ["home", "albums", "artists", "playlists", "favorites"];
const TAB_LABEL = {
  home: "jellyfin.tab_home",
  albums: "jellyfin.tab_albums",
  artists: "jellyfin.tab_artists",
  playlists: "jellyfin.tab_playlists",
  favorites: "jellyfin.tab_favorites",
} as const;

/** Quiet text tabs; the current one is in full colour with an accent underline. One row, scrolls sideways on a phone. */
export function TextTabs<T extends string>(props: { tabs: T[]; current: T; label: (t: T) => string; onPick: (t: T) => void }) {
  return (
    <div role="tablist" class="flex gap-6 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
      <For each={props.tabs}>{(k) => (
        <button type="button" role="tab" aria-selected={props.current === k} onClick={() => props.onPick(k)}
          class={`relative shrink-0 pb-2 text-sm transition-colors duration-300 ${props.current === k ? "text-txt" : "text-muted hover:text-txt"}`}>
          {props.label(k)}
          <span class={`absolute left-0 bottom-0 h-0.5 rounded-full bg-accent transition-all duration-300 ${props.current === k ? "w-full" : "w-0"}`} />
        </button>
      )}</For>
    </div>
  );
}

function Library(props: { s: JellyfinSession }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const { section } = useSection();
  const libs = useQuery(() => ({ queryKey: key(props.s, "libraries"), queryFn: () => libraries(props.s), ...jfQuery }));
  const hasMusic = () => !libs.data || libs.data.some((l) => l.CollectionType === "music");
  const videoLibs = () => libs.data?.filter(isVideoLibrary) ?? [];

  const tabs = (): Tab[] =>
    section() === "music"
      // Until the libraries are known (or if that call fails) show every music tab
      ? MUSIC_TABS.filter((k) => hasMusic() || k === "home" || k === "playlists" || k === "favorites")
      : ["home", ...videoLibs().map((l) => `lib:${l.Id}` as Tab), "favorites"];
  const tab = (): Tab => (tabs().includes(params.view as Tab) ? (params.view as Tab) : "home");
  const label = (k: Tab) =>
    k.startsWith("lib:") ? videoLibs().find((l) => `lib:${l.Id}` === k)?.Name ?? "" : t(TAB_LABEL[k as keyof typeof TAB_LABEL]);
  const libOf = (k: Tab) => videoLibs().find((l) => `lib:${l.Id}` === k);

  return (
    <div class="space-y-8">
      <TextTabs tabs={tabs()} current={tab()} label={label}
        onPick={(k) => setParams({ view: k === "home" ? undefined : k, sort: undefined, dir: undefined })} />
      <Show when={`${section()}:${tab()}`} keyed>
        {(_k) => (
          <Motion.div {...fade}>
            <Switch>
              <Match when={tab() === "home" && section() === "music"}><MusicHome s={props.s} /></Match>
              <Match when={tab() === "home"}><VideoHome s={props.s} /></Match>
              <Match when={libOf(tab())}>{(lib) => <Paged s={props.s} kind={{ library: lib().Id, posters: lib().CollectionType !== "homevideos" && lib().CollectionType !== "musicvideos" }} />}</Match>
              <Match when={tab() === "albums" || tab() === "artists"}><Paged s={props.s} kind={tab() as "albums" | "artists"} /></Match>
              <Match when={tab() === "playlists"}><Playlists s={props.s} /></Match>
              <Match when={tab() === "favorites"}><Favorites s={props.s} video={section() === "video"} /></Match>
            </Switch>
          </Motion.div>
        )}
      </Show>
    </div>
  );
}

type Shelfq = ReturnType<typeof useShelf>;
function useShelf(s: () => JellyfinSession, name: string, fn: (s: JellyfinSession) => Promise<JfPage>) {
  return useQuery(() => ({ queryKey: key(s(), "home", name), queryFn: () => fn(s()), ...jfQuery }));
}

/** Shelves, each appearing as soon as its own data lands — a skeleton until then. */
function Shelves(props: { s: JellyfinSession; rows: { q: Shelfq; title: string; landscape?: boolean }[] }) {
  return (
    <Show when={!props.rows.every((r) => r.q.isError)} fallback={<QueryError error={props.rows[0]?.q.error} />}>
      <div class="space-y-10">
        <For each={props.rows}>
          {(r) => (
            <Show when={!r.q.isPending} fallback={<SkeletonShelf landscape={r.landscape} />}>
              <Shelf s={props.s} title={r.title} items={r.q.data?.Items ?? []} landscape={r.landscape} />
            </Show>
          )}
        </For>
        <Show when={props.rows.every((r) => !r.q.isPending && !r.q.data?.Items.length)}>
          <Empty />
        </Show>
      </div>
    </Show>
  );
}

function MusicHome(props: { s: JellyfinSession }) {
  const { t } = useI18n();
  const s = () => props.s;
  return (
    <Shelves s={props.s} rows={[
      { q: useShelf(s, "played", recentlyPlayed), title: t("jellyfin.shelf_played") },
      { q: useShelf(s, "added", recentlyAdded), title: t("jellyfin.shelf_added") },
      { q: useShelf(s, "most", mostPlayed), title: t("jellyfin.shelf_most") },
      { q: useShelf(s, "playlists", listPlaylists), title: t("jellyfin.tab_playlists") },
    ]} />
  );
}

function VideoHome(props: { s: JellyfinSession }) {
  const { t } = useI18n();
  const s = () => props.s;
  return (
    <Shelves s={props.s} rows={[
      { q: useShelf(s, "resume", resumeVideos), title: t("jellyfin.shelf_continue"), landscape: true },
      { q: useShelf(s, "nextup", nextUp), title: t("jellyfin.shelf_nextup"), landscape: true },
      { q: useShelf(s, "added-video", recentlyAddedVideo), title: t("jellyfin.shelf_added") },
    ]} />
  );
}

type PagedKind = "albums" | "artists" | { library: string; posters: boolean };
const pagedFetch = (s: JellyfinSession, kind: PagedKind, start: number, sort: Sort): Promise<JfPage> =>
  kind === "albums" ? listAlbums(s, start, undefined, sort)
  : kind === "artists" ? listArtists(s, start, sort)
  : listLibrary(s, kind.library, start, sort);

/** "Sort by [Name ▾] ↑" — right-aligned above a grid. */
function SortControl(props: { ctl: ReturnType<typeof useSort> }) {
  const { t } = useI18n();
  const c = props.ctl;
  return (
    <div class="flex items-center justify-end gap-1">
      <label class="flex items-center gap-2 text-sm text-muted">
        <MdOutlineSort size={18} aria-hidden="true" />
        <span class="sr-only">{t("jellyfin.sort_by")}</span>
        <select value={c.option().id} onChange={(e) => c.pick(e.currentTarget.value)}
          class="bg-transparent border-0 border-b border-rim focus:border-accent outline-none py-1 pr-6 text-sm text-txt">
          <For each={c.options()}>{(o) => <option value={o.id}>{t(o.label)}</option>}</For>
        </select>
      </label>
      <Show when={c.option().id !== "random"}>
        <button type="button" class={iconBtn} onClick={c.flip}
          title={c.desc() ? t("jellyfin.sort_desc") : t("jellyfin.sort_asc")} aria-label={c.desc() ? t("jellyfin.sort_desc") : t("jellyfin.sort_asc")}>
          <Show when={c.desc()} fallback={<MdFillArrow_upward size={18} />}><MdFillArrow_downward size={18} /></Show>
        </button>
      </Show>
    </div>
  );
}

function Paged(props: { s: JellyfinSession; kind: PagedKind }) {
  const { t } = useI18n();
  const sortCtl = useSort(() => (typeof props.kind === "string" ? props.kind : "library"));
  const q = useInfiniteQuery(() => ({
    queryKey: key(props.s, typeof props.kind === "string" ? props.kind : `lib:${props.kind.library}`, sortCtl.sort()),
    queryFn: ({ pageParam }) => pagedFetch(props.s, props.kind, pageParam, sortCtl.sort()),
    initialPageParam: 0,
    getNextPageParam: (last: JfPage, all: JfPage[]) => {
      const loaded = all.length * PAGE_SIZE;
      return loaded < last.TotalRecordCount ? loaded : undefined;
    },
    ...jfQuery,
  }));
  const items = createMemo(() => q.data?.pages.flatMap((pg) => pg.Items) ?? []);

  return (
    <div class="space-y-6">
    <SortControl ctl={sortCtl} />
    <Show when={!q.isError} fallback={<QueryError error={q.error} />}>
      <Show when={!q.isPending} fallback={<Loading kind={typeof props.kind === "object" && props.kind.posters ? "poster-grid" : "grid"} />}>
        <Show when={items().length} fallback={<Empty />}>
          <ItemGrid s={props.s} items={items()} />
        </Show>
        <Show when={q.hasNextPage}>
          <div class="text-center pt-6">
            <button type="button" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} class={ghostPill}>
              {t("jellyfin.load_more")}
            </button>
          </div>
        </Show>
      </Show>
    </Show>
    </div>
  );
}

function Playlists(props: { s: JellyfinSession }) {
  const { t } = useI18n();
  const q = useQuery(() => ({ queryKey: key(props.s, "playlists"), queryFn: () => listPlaylists(props.s), ...jfQuery }));
  return (
    <Show when={!q.isError} fallback={<QueryError error={q.error} />}>
      <Show when={q.data} fallback={<Loading />}>
        <Show when={q.data!.Items.length} fallback={<Empty>{t("jellyfin.no_playlists")}</Empty>}>
          <ItemGrid s={props.s} items={q.data!.Items} />
        </Show>
      </Show>
    </Show>
  );
}

function Favorites(props: { s: JellyfinSession; video: boolean }) {
  const { t } = useI18n();
  const q = useQuery(() => ({ queryKey: key(props.s, "favorites", props.video ? "video" : "music"), queryFn: () => listFavorites(props.s, props.video), ...jfQuery }));
  const groups = () => q.data?.Items.filter((i) => i.Type !== "Audio") ?? [];
  const tracks = () => q.data?.Items.filter((i) => i.Type === "Audio") ?? [];
  return (
    <Show when={!q.isError} fallback={<QueryError error={q.error} />}>
      <Show when={q.data} fallback={<Loading />}>
        <Show when={q.data!.Items.length} fallback={<Empty>{t("jellyfin.no_favorites")}</Empty>}>
          <div class="space-y-4">
            <Show when={groups().length}><ItemGrid s={props.s} items={groups()} /></Show>
            <Show when={tracks().length}>
              <h3 class="text-sm font-semibold text-txt">{t("jellyfin.tracks")}</h3>
              <TrackList s={props.s} tracks={tracks()} showAlbum />
            </Show>
          </div>
        </Show>
      </Show>
    </Show>
  );
}

// ── Detail pages ──────────────────────────────────────────────────────────────

/**
 * Every detail page opens the same way: the item's own art as a faint wash,
 * the cover, the title large and light, its details on quiet lines of their
 * own, then one filled primary action and the rest as bare icons.
 */
function Hero(props: {
  s: JellyfinSession;
  item: JfItem | undefined;
  lines?: (string | number | undefined)[];
  shape?: "square" | "round" | "poster";
  primary?: JSX.Element;
  secondary?: JSX.Element;
  menu?: JSX.Element;
}) {
  const art = () => (props.item ? imageUrl(props.s, props.item, 400) : null);
  const cover = () =>
    props.shape === "poster" ? "w-36 sm:w-48 aspect-[2/3]"
    : props.shape === "round" ? "w-36 h-36 sm:w-48 sm:h-48 !rounded-full"
    : "w-36 h-36 sm:w-48 sm:h-48";
  return (
    <header class="relative isolate">
      <Show when={art()}>
        <div class="absolute -inset-x-4 -top-24 h-[calc(100%+6rem)] -z-10 overflow-hidden pointer-events-none
                    [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden="true">
          <img src={art()!} alt="" class="w-full h-full object-cover blur-3xl opacity-25 saturate-150 scale-110" />
        </div>
      </Show>
      <div class="flex flex-wrap items-end gap-6 sm:gap-8">
        <Art src={art()} class={`${cover()} shadow-xl`} />
        <div class="min-w-0 flex-1 basis-60 space-y-4">
          <div class="space-y-1">
            <h2 class="text-2xl font-bold text-txt break-words">{props.item?.Name ?? "\u00a0"}</h2>
            <For each={(props.lines ?? []).filter((l) => l !== undefined && l !== "")}>
              {(l) => <p class="text-sm text-muted">{l}</p>}
            </For>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            {props.primary}
            {props.secondary}
            <Show when={props.item}>
              {(it) => (
                <span class="flex items-center">
                  <FavoriteButton s={props.s} item={it()} size={20} />
                  <ShareButton session={props.s} item={it()} icon />
                  {props.menu}
                </span>
              )}
            </Show>
          </div>
        </div>
      </div>
      <Show when={props.item?.Overview}>
        <p class="mt-6 max-w-prose text-sm leading-relaxed text-muted whitespace-pre-line">{props.item!.Overview}</p>
      </Show>
    </header>
  );
}

/** Play all + Shuffle for a track list (album, playlist). */
function trackActions(s: JellyfinSession, tracks: () => JfItem[], t: ReturnType<typeof useI18n>["t"]) {
  const shufflePlay = () => {
    const list = tracks();
    if (!list.length) return;
    if (!shuffled()) toggleShuffle();
    playList(s, list, Math.floor(Math.random() * list.length));
  };
  return {
    primary: (
      <button type="button" class={primaryPill} disabled={!tracks().length} onClick={() => playList(s, tracks())}>
        <MdFillPlay_arrow size={20} /> {t("jellyfin.play_all")}
      </button>
    ),
    secondary: (
      <button type="button" class={ghostPill} disabled={!tracks().length} onClick={shufflePlay}>
        <MdFillShuffle size={18} /> {t("jellyfin.shuffle")}
      </button>
    ),
  };
}

function useItem(s: () => JellyfinSession, id: () => string) {
  return useQuery(() => ({ queryKey: key(s(), "item", id()), queryFn: () => getItem(s(), id()), ...jfQuery }));
}

function ArtistDetail(props: { s: JellyfinSession; id: string }) {
  const { t } = useI18n();
  const artist = useItem(() => props.s, () => props.id);
  const albums = useQuery(() => ({ queryKey: key(props.s, "artist-albums", props.id), queryFn: () => listAlbums(props.s, 0, props.id), ...jfQuery }));
  return (
    <div class="space-y-10">
      <div class="space-y-6">
        <BackLink />
        <Hero s={props.s} item={artist.data} shape="round"
          lines={[albums.data ? t("jellyfin.album_count", { n: String(albums.data.TotalRecordCount) }) : undefined]}
          primary={<Show when={artist.data}>{(it) => (
            <button type="button" class={primaryPill} onClick={() => void startMix(props.s, it(), t)}>
              <MdFillRadio size={18} /> {t("jellyfin.instant_mix")}
            </button>
          )}</Show>} />
      </div>
      <Show when={!albums.isError} fallback={<QueryError error={albums.error} />}>
        <Show when={albums.data} fallback={<Loading />}>
          {(d) => <Show when={d().Items.length} fallback={<Empty />}><ItemGrid s={props.s} items={d().Items} /></Show>}
        </Show>
      </Show>
    </div>
  );
}

function AlbumDetail(props: { s: JellyfinSession; id: string }) {
  const { t } = useI18n();
  const album = useItem(() => props.s, () => props.id);
  const tracks = useQuery(() => ({ queryKey: key(props.s, "tracks", props.id), queryFn: () => listAlbumTracks(props.s, props.id), ...jfQuery }));
  const list = () => tracks.data?.Items ?? [];
  return (
    <div class="space-y-10">
      <div class="space-y-6">
        <BackLink />
        <Hero s={props.s} item={album.data}
          lines={[album.data?.AlbumArtist, [album.data?.ProductionYear, tracks.data ? t("jellyfin.track_count", { n: String(list().length) }) : undefined, totalMin(list()) ? t("jellyfin.minutes", { n: String(totalMin(list())) }) : undefined].filter(Boolean).join(", ")]}
          {...trackActions(props.s, list, t)}
          menu={<Show when={album.data && list().length}><TrackMenu s={props.s} tracks={list()} mixSeed={album.data!} /></Show>} />
      </div>
      <Show when={!tracks.isError} fallback={<QueryError error={tracks.error} />}>
        <Show when={tracks.data} fallback={<Loading kind="rows" />}>
          <TrackList s={props.s} tracks={list()} showAlbum={false} />
        </Show>
      </Show>
    </div>
  );
}

function PlaylistDetail(props: { s: JellyfinSession; id: string }) {
  const { t } = useI18n();
  const pl = useItem(() => props.s, () => props.id);
  const items = useQuery(() => ({ queryKey: key(props.s, "playlist", props.id), queryFn: () => playlistItems(props.s, props.id), ...jfQuery }));
  const list = () => items.data?.Items ?? [];
  return (
    <div class="space-y-10">
      <div class="space-y-6">
        <BackLink />
        <Hero s={props.s} item={pl.data}
          lines={[items.data ? [t("jellyfin.track_count", { n: String(list().length) }), totalMin(list()) ? t("jellyfin.minutes", { n: String(totalMin(list())) }) : undefined].filter(Boolean).join(", ") : undefined]}
          {...trackActions(props.s, list, t)}
          menu={<Show when={pl.data && list().length}><TrackMenu s={props.s} tracks={list()} mixSeed={pl.data!} /></Show>} />
      </div>
      <Show when={!items.isError} fallback={<QueryError error={items.error} />}>
        <Show when={items.data} fallback={<Loading kind="rows" />}>
          <Show when={list().length} fallback={<Empty />}>
            <TrackList s={props.s} tracks={list()} showAlbum />
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function SearchResults(props: { s: JellyfinSession; term: string }) {
  const { t } = useI18n();
  const q = useQuery(() => ({ queryKey: key(props.s, "search", props.term), queryFn: () => search(props.s, props.term), ...jfQuery }));
  const of = (type: string) => q.data?.Items.filter((i) => i.Type === type) ?? [];
  const groups = () => [...of("MusicArtist"), ...of("MusicAlbum")];

  return (
    <div class="space-y-4">
      <Show when={!q.isError} fallback={<QueryError error={q.error} />}>
        <Show when={q.data} fallback={<Loading />}>
          <Show when={q.data!.Items.length} fallback={<Empty>{t("jellyfin.no_results")}</Empty>}>
            <Show when={groups().length}><ItemGrid s={props.s} items={groups()} /></Show>
            <Show when={of("Audio").length}>
              <h3 class="text-sm font-semibold text-txt">{t("jellyfin.tracks")}</h3>
              <TrackList s={props.s} tracks={of("Audio")} showAlbum />
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

// ── Video pages ───────────────────────────────────────────────────────────────

function PlayVideoButton(props: { item: JfItem }) {
  const { t } = useI18n();
  const [, setParams] = useSearchParams();
  const resumeAt = () => ticksToSeconds(props.item.UserData?.PlaybackPositionTicks);
  return (
    <button type="button" class={primaryPill} onClick={() => setParams({ watch: props.item.Id, item: undefined, series: undefined, t: undefined })}>
      <MdFillPlay_arrow size={20} /> {resumeAt() > 0 ? t("jellyfin.resume") : t("jellyfin.play")}
    </button>
  );
}

const minutes = (i: JfItem) => Math.round(ticksToSeconds(i.RunTimeTicks) / 60);
const totalMin = (list: JfItem[]) => Math.round(list.reduce((n, i) => n + ticksToSeconds(i.RunTimeTicks), 0) / 60);
/** Where "Play" on a series starts: the first episode not yet watched. */
const firstUnwatched = (eps: JfItem[]) => eps.find((e) => !e.UserData?.Played);

function MovieDetail(props: { s: JellyfinSession; id: string }) {
  const { t } = useI18n();
  const item = useItem(() => props.s, () => props.id);
  return (
    <div class="space-y-6">
      <BackLink />
      <Show when={!item.isError} fallback={<QueryError error={item.error} />}>
        <Show when={item.data} fallback={<Loading kind="rows" />}>
          {(it) => (
            <Hero s={props.s} item={it()} shape="poster"
              lines={[[it().ProductionYear, it().OfficialRating, minutes(it()) ? t("jellyfin.minutes", { n: String(minutes(it())) }) : ""].filter(Boolean).join(", ")]}
              primary={<PlayVideoButton item={it()} />} />
          )}
        </Show>
      </Show>
    </div>
  );
}

function SeriesDetail(props: { s: JellyfinSession; id: string }) {
  const { t } = useI18n();
  const [, setParams] = useSearchParams();
  const series = useItem(() => props.s, () => props.id);
  const seasonList = useQuery(() => ({ queryKey: key(props.s, "seasons", props.id), queryFn: () => seasons(props.s, props.id), ...jfQuery }));
  const [season, setSeason] = createSignal<string | null>(null);
  createEffect(() => {
    const first = seasonList.data?.Items[0]?.Id;
    if (first && !season()) setSeason(first);
  });
  const eps = useQuery(() => ({
    queryKey: key(props.s, "episodes", props.id, season()),
    queryFn: () => episodes(props.s, props.id, season()!),
    enabled: !!season(),
    ...jfQuery,
  }));

  return (
    <div class="space-y-8">
      <div class="space-y-6">
        <BackLink />
        <Show when={!series.isError} fallback={<QueryError error={series.error} />}>
          <Show when={series.data} fallback={<Loading kind="rows" />}>
            {(it) => <Hero s={props.s} item={it()} shape="poster" lines={[it().ProductionYear]}
              primary={<Show when={eps.data?.Items[0]}>{(first) => <PlayVideoButton item={firstUnwatched(eps.data!.Items) ?? first()} />}</Show>} />}
          </Show>
        </Show>
      </div>
      <Show when={(seasonList.data?.Items.length ?? 0) > 1}>
        <TextTabs tabs={seasonList.data!.Items.map((x) => x.Id)} current={season() ?? ""}
          label={(id) => seasonList.data!.Items.find((x) => x.Id === id)?.Name ?? ""} onPick={setSeason} />
      </Show>
      <Show when={eps.data} fallback={<Show when={season()}><Loading kind="rows" /></Show>}>
        <ol class="space-y-1">
          <For each={eps.data!.Items}>
            {(ep) => {
              const progress = () => {
                const pos = ep.UserData?.PlaybackPositionTicks ?? 0;
                return pos && ep.RunTimeTicks ? (pos / ep.RunTimeTicks) * 100 : 0;
              };
              return (
                <li>
                  <button type="button" onClick={() => setParams({ watch: ep.Id, series: undefined, t: undefined })}
                    class="group flex w-full gap-4 p-2 rounded-2xl text-left hover:bg-elevated/40 transition-colors">
                    <div class="relative w-32 sm:w-40 shrink-0">
                      <Art src={imageUrl(props.s, ep, 300)} class="w-full aspect-video" />
                      <Show when={progress() > 0}>
                        <div class="absolute inset-x-1 bottom-1 h-1 rounded-full bg-black/50 overflow-hidden">
                          <div class="h-full bg-accent" style={{ width: `${progress()}%` }} />
                        </div>
                      </Show>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm text-txt group-hover:text-accent-txt transition-colors">
                        {videoTitle(ep)}
                        <Show when={ep.UserData?.Played}> <span class="text-xs text-muted">✓</span></Show>
                      </p>
                      <Show when={minutes(ep)}><p class="text-xs text-muted">{t("jellyfin.minutes", { n: String(minutes(ep)) })}</p></Show>
                      <Show when={ep.Overview}><p class="text-xs text-muted line-clamp-2 mt-1">{ep.Overview}</p></Show>
                    </div>
                  </button>
                </li>
              );
            }}
          </For>
        </ol>
      </Show>
    </div>
  );
}
