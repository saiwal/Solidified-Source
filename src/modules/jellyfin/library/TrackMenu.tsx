// Per-item "⋯" menu: Play next, Add to queue, Add to playlist, Instant mix,
// Play on <device>. One popover instead of a row of icon buttons, so track rows
// stay usable at phone width.
import { For, Show, createSignal } from "solid-js";
import { useQuery, useQueryClient } from "@utsukta/spa-core/lib/query";
import {
  MdFillMore_vert, MdFillQueue_play_next, MdFillPlaylist_add, MdFillRadio, MdFillCast, MdFillQueue_music,
  MdFillArrow_back, MdFillAdd,
} from "solid-icons/md";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { listPlaylists, addToPlaylist, createPlaylist, type JellyfinSession, type JfItem } from "../api";
import { playNext, enqueue } from "../store";
import { playTargets, playOn } from "../remote";
import { startMix } from "./mix";
import { jfQuery } from "./common";
import { Motion, fade } from "../anim";
import { IconButton } from "@ui/Button";
import { Menu, MenuItem, useMenu } from "@ui/Menu";
import { Input } from "@ui/Field";

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
  const [open, setOpen] = createSignal(false);
  const [panel, setPanel] = createSignal<"main" | "playlists">("main");
  const [newName, setNewName] = createSignal("");

  const playlists = useQuery(() => ({
    queryKey: ["jellyfin", props.s.server, props.s.userId, "playlists"],
    queryFn: () => listPlaylists(props.s),
    enabled: open() && panel() === "playlists",
    ...jfQuery,
  }));

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) { setPanel("main"); setNewName(""); }
  };
  const forPlaylist = () => props.tracks.map((x) => x.Id);

  const addTo = async (id: string, name: string) => {
    try {
      await addToPlaylist(props.s, id, forPlaylist());
      await qc.invalidateQueries({ queryKey: ["jellyfin", props.s.server, props.s.userId, "playlist", id] });
      toast.success(t("jellyfin.added_to_playlist", { name }));
    } catch {
      toast.error(t("jellyfin.playlist_failed"));
    }
  };

  const create = async (name: string) => {
    try {
      await createPlaylist(props.s, name, forPlaylist());
      await qc.invalidateQueries({ queryKey: ["jellyfin", props.s.server, props.s.userId, "playlists"] });
      toast.success(t("jellyfin.added_to_playlist", { name }));
    } catch {
      toast.error(t("jellyfin.playlist_failed"));
    }
  };

  return (
    <Menu
      label={t("jellyfin.more")}
      class="w-64 max-h-80 overflow-y-auto"
      onOpenChange={onOpenChange}
      trigger={(p) => (
        <IconButton label={t("jellyfin.more")} size="sm" class="shrink-0" {...p}>
          <MdFillMore_vert size={18} />
        </IconButton>
      )}
    >
      <Show when={panel()} keyed>{(_panel) => <Motion.div {...fade}>
      <Show when={panel() === "main"} fallback={
        <>
          <MenuItem icon={<MdFillArrow_back size={16} />} class="text-muted!" keepOpen onClick={() => setPanel("main")}>
            {t("jellyfin.back")}
          </MenuItem>
          <Show when={playlists.data} fallback={<p class="px-2.5 py-1.5 text-xs text-muted">{t("jellyfin.loading")}</p>}>
            <For each={playlists.data!.Items}>
              {(pl) => (
                <MenuItem icon={<MdFillQueue_music size={16} />} onClick={() => void addTo(pl.Id, pl.Name)}>
                  <span class="truncate">{pl.Name}</span>
                </MenuItem>
              )}
            </For>
          </Show>
          <NewPlaylistForm name={newName()} setName={setNewName} onCreate={(n) => void create(n)} />
        </>
      }>
        <MenuItem icon={<MdFillQueue_play_next size={16} />} onClick={() => playNext(props.s, props.tracks)}>
          {t("jellyfin.play_next")}
        </MenuItem>
        <MenuItem icon={<MdFillPlaylist_add size={16} />} onClick={() => enqueue(props.s, props.tracks)}>
          {t("jellyfin.add_to_queue")}
        </MenuItem>
        <MenuItem icon={<MdFillQueue_music size={16} />} keepOpen onClick={() => setPanel("playlists")}>
          {t("jellyfin.add_to_playlist")}
        </MenuItem>
        <Show when={props.mixSeed}>
          <MenuItem icon={<MdFillRadio size={16} />} onClick={() => void startMix(props.s, props.mixSeed!, t)}>
            {t("jellyfin.instant_mix")}
          </MenuItem>
        </Show>
        <Show when={playTargets(props.s.id).length}>
          <p class="px-3 pt-3 pb-1 text-xs text-muted">
            {t("jellyfin.play_on")}
          </p>
          <For each={playTargets(props.s.id)}>
            {(r) => (
              <MenuItem
                icon={<MdFillCast size={16} />}
                onClick={() => {
                  playOn(r, props.playOnTracks ?? props.tracks, props.start ?? 0)
                    .then(() => toast.success(t("jellyfin.play_on_sent", { device: r.device })))
                    .catch(() => toast.error(t("jellyfin.play_on_failed", { device: r.device })));
                }}
              >
                <span class="truncate">{r.device}</span>
              </MenuItem>
            )}
          </For>
        </Show>
      </Show>
      </Motion.div>}</Show>
    </Menu>
  );
}

// Inside the menu so it can close it on submit — a form isn't a MenuItem.
function NewPlaylistForm(props: { name: string; setName: (v: string) => void; onCreate: (name: string) => void }) {
  const { t } = useI18n();
  const menu = useMenu();
  return (
    <form
      class="flex items-center gap-1 mt-1.5 pt-2 px-2"
      onSubmit={(e) => {
        e.preventDefault();
        const name = props.name.trim();
        if (!name) return;
        menu.close();
        props.onCreate(name);
      }}
    >
      <Input
        class="flex-1 min-w-0"
        value={props.name}
        onInput={(e) => props.setName(e.currentTarget.value)}
        placeholder={t("jellyfin.new_playlist")}
      />
      <IconButton label={t("jellyfin.create")} size="sm" type="submit">
        <MdFillAdd size={16} />
      </IconButton>
    </form>
  );
}
