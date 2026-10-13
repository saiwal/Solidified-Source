// Per-item "⋯" menu: Play next, Add to queue, Add to playlist, Instant mix,
// Play on <device>. One popover instead of a row of icon buttons, so track rows
// stay usable at phone width.
import { For, Show, createSignal } from "solid-js";
import { Portal } from "solid-js/web";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import {
  MdFillMore_vert, MdFillQueue_play_next, MdFillPlaylist_add, MdFillRadio, MdFillCast, MdFillQueue_music,
  MdFillArrow_back, MdFillAdd,
} from "solid-icons/md";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createPopover } from "@/shared/stream/filters/createPopover";
import { listPlaylists, addToPlaylist, createPlaylist, type JellyfinSession, type JfItem } from "../api";
import { playNext, enqueue } from "../store";
import { playTargets, playOn } from "../remote";
import { startMix } from "./mix";
import { jfQuery } from "./common";
import { Motion, fade } from "../anim";

export default function TrackMenu(props: {
  s: JellyfinSession;
  /** What Play next / Add to queue / Add to playlist act on. */
  tracks: JfItem[];
  /** Seed for Instant mix (a track, album, artist or playlist). */
  mixSeed?: JfItem;
  /**
   * What Play on sends, from `start` — defaults to `tracks`. A track row
   * passes its whole list, so the other device carries on past that track.
   */
  playOnTracks?: JfItem[];
  start?: number;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const pop = createPopover({ placement: "bottom-end" });
  const [panel, setPanel] = createSignal<"main" | "playlists">("main");
  const [newName, setNewName] = createSignal("");

  const playlists = useQuery(() => ({
    queryKey: ["jellyfin", props.s.server, props.s.userId, "playlists"],
    queryFn: () => listPlaylists(props.s),
    enabled: pop.open() && panel() === "playlists",
    ...jfQuery,
  }));

  const close = () => { pop.setOpen(false); setPanel("main"); setNewName(""); };
  const forPlaylist = () => props.tracks.map((x) => x.Id);

  const addTo = async (id: string, name: string) => {
    close();
    try {
      await addToPlaylist(props.s, id, forPlaylist());
      await qc.invalidateQueries({ queryKey: ["jellyfin", props.s.server, props.s.userId, "playlist", id] });
      toast.success(t("jellyfin.added_to_playlist", { name }));
    } catch {
      toast.error(t("jellyfin.playlist_failed"));
    }
  };

  const create = async (e: Event) => {
    e.preventDefault();
    const name = newName().trim();
    if (!name) return;
    close();
    try {
      await createPlaylist(props.s, name, forPlaylist());
      await qc.invalidateQueries({ queryKey: ["jellyfin", props.s.server, props.s.userId, "playlists"] });
      toast.success(t("jellyfin.added_to_playlist", { name }));
    } catch {
      toast.error(t("jellyfin.playlist_failed"));
    }
  };

  const item = "w-full flex items-center gap-3 text-left px-3 py-2 rounded-xl text-sm text-txt hover:bg-elevated/70";

  return (
    <>
      <span ref={pop.ref}>
        <button type="button" title={t("jellyfin.more")} aria-label={t("jellyfin.more")}
          onClick={() => (pop.open() ? close() : pop.setOpen(true))}
          class="p-1 shrink-0 text-muted hover:text-txt">
          <MdFillMore_vert size={18} />
        </button>
      </span>
      <Show when={pop.open()}>
        <Portal mount={topLayer()}>
          <div ref={pop.floating} style={pop.style()}
            class="z-50 w-64 max-h-80 overflow-y-auto rounded-2xl bg-surface/95 backdrop-blur-xl shadow-2xl ring-1 ring-rim/60 p-2">
            <Show when={panel()} keyed>{(_panel) => <Motion.div {...fade}>
            <Show when={panel() === "main"} fallback={
              <>
                <button type="button" class={`${item} text-muted`} onClick={() => setPanel("main")}>
                  <MdFillArrow_back size={16} /> {t("jellyfin.back")}
                </button>
                <Show when={playlists.data} fallback={<p class="px-2.5 py-1.5 text-xs text-muted">{t("jellyfin.loading")}</p>}>
                  <For each={playlists.data!.Items}>
                    {(pl) => (
                      <button type="button" class={item} onClick={() => void addTo(pl.Id, pl.Name)}>
                        <MdFillQueue_music size={16} class="text-muted shrink-0" />
                        <span class="truncate">{pl.Name}</span>
                      </button>
                    )}
                  </For>
                </Show>
                <form onSubmit={create} class="flex items-center gap-1 mt-1.5 pt-2 px-2">
                  <input value={newName()} onInput={(e) => setNewName(e.currentTarget.value)}
                    placeholder={t("jellyfin.new_playlist")}
                    class="flex-1 min-w-0 bg-transparent border-0 border-b border-rim focus:border-accent outline-none px-1 py-1 text-sm text-txt" />
                  <button type="submit" title={t("jellyfin.create")} class="p-1.5 rounded-full text-muted hover:text-txt hover:bg-elevated/70">
                    <MdFillAdd size={16} />
                  </button>
                </form>
              </>
            }>
              <button type="button" class={item} onClick={() => { close(); playNext(props.s, props.tracks); }}>
                <MdFillQueue_play_next size={16} class="text-muted" /> {t("jellyfin.play_next")}
              </button>
              <button type="button" class={item} onClick={() => { close(); enqueue(props.s, props.tracks); }}>
                <MdFillPlaylist_add size={16} class="text-muted" /> {t("jellyfin.add_to_queue")}
              </button>
              <button type="button" class={item} onClick={() => setPanel("playlists")}>
                <MdFillQueue_music size={16} class="text-muted" /> {t("jellyfin.add_to_playlist")}
              </button>
              <Show when={props.mixSeed}>
                <button type="button" class={item} onClick={() => { close(); void startMix(props.s, props.mixSeed!, t); }}>
                  <MdFillRadio size={16} class="text-muted" /> {t("jellyfin.instant_mix")}
                </button>
              </Show>
              <Show when={playTargets(props.s.id).length}>
                <p class="px-3 pt-3 pb-1 text-xs text-muted">
                  {t("jellyfin.play_on")}
                </p>
                <For each={playTargets(props.s.id)}>
                  {(r) => (
                    <button type="button" class={item} onClick={() => {
                      close();
                      playOn(r, props.playOnTracks ?? props.tracks, props.start ?? 0)
                        .then(() => toast.success(t("jellyfin.play_on_sent", { device: r.device })))
                        .catch(() => toast.error(t("jellyfin.play_on_failed", { device: r.device })));
                    }}>
                      <MdFillCast size={16} class="text-muted shrink-0" />
                      <span class="truncate">{r.device}</span>
                    </button>
                  )}
                </For>
              </Show>
            </Show>
            </Motion.div>}</Show>
          </div>
        </Portal>
      </Show>
    </>
  );
}
