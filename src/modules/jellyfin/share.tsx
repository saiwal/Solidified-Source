// Share button: opens the post composer pre-filled with "🎵 Listening to …"
// plus the album cover re-hosted on the hub. Used for both local playback
// (NowPlayingPanel) and other devices' playback (RemoteSessions).
import { createSignal, Show } from "solid-js";
import { MdOutlineShare } from "solid-icons/md";
import { iconBtn, ghostPill } from "./ui";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth, currentNick, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import PostComposer from "@/shared/editor/composers/PostComposer";
import { bbAlt, bbcodeToInsert } from "@/shared/editor/attachments/insertHelpers";
import { wallAttach } from "@/modules/files/api";
import { fetchCover, type JellyfinSession, type JfItem } from "./api";

/** Status line for the Share button, before the cover is prepended. */
export function statusText(t: JfItem, tr: ReturnType<typeof useI18n>["t"]): string {
  const artist = t.Artists?.join(", ") || t.AlbumArtist || "";
  switch (t.Type) {
    case "MusicAlbum":
      return `🎶 ${artist ? tr("jellyfin.share_album", { album: t.Name, artist }) : tr("jellyfin.share_album_noartist", { album: t.Name })} #NowPlaying`;
    case "Playlist":
      return `🎶 ${tr("jellyfin.share_playlist", { name: t.Name })} #NowPlaying`;
    case "MusicArtist":
      return `🎶 ${tr("jellyfin.share_artist", { artist: t.Name })} #NowPlaying`;
    case "Movie":
      return `🎬 ${tr("jellyfin.share_movie", { title: t.ProductionYear ? `${t.Name} (${t.ProductionYear})` : t.Name })} #NowWatching`;
    case "Series":
      return `📺 ${tr("jellyfin.share_movie", { title: t.Name })} #NowWatching`;
    case "Episode": {
      const se = t.ParentIndexNumber != null && t.IndexNumber != null ? ` S${t.ParentIndexNumber}E${t.IndexNumber}` : "";
      return `📺 ${tr("jellyfin.share_episode", { series: `${t.SeriesName ?? ""}${se}`, title: t.Name })} #NowWatching`;
    }
  }
  const line = artist
    ? tr("jellyfin.share_text", { track: t.Name, artist })
    : tr("jellyfin.share_text_noartist", { track: t.Name });
  return `🎵 ${line}${t.Album ? ` (${t.Album})` : ""} #NowPlaying`;
}

// Cover URL on the hub, per server + album, for this page load — so sharing
// several tracks off one album doesn't pile copies into Wall Photos.
const hostedCovers = new Map<string, string>();

/**
 * Re-host the cover on the hub via wall_attach (the same pipeline the
 * Excalidraw/LaTeX image inserts use) rather than linking Jellyfin directly:
 * a Jellyfin URL would leak the server's address to every recipient and fail
 * for anyone who can't reach it — a home LAN, or a server requiring auth.
 * Best effort: any failure just means a text-only share.
 */
async function hostedCover(s: JellyfinSession, t: JfItem): Promise<string | null> {
  const key = `${s.id}:${t.AlbumId ?? t.Id}`;
  const cached = hostedCovers.get(key);
  if (cached) return cached;
  try {
    const file = await fetchCover(s, t);
    if (!file) return null;
    const res = await wallAttach(currentNick(), file);
    if (!res.isPhoto || !res.src) return null;
    hostedCovers.set(key, res.src);
    return res.src;
  } catch {
    return null;
  }
}

export default function ShareButton(props: { session: JellyfinSession | null; item: JfItem; icon?: boolean }) {
  const { t } = useI18n();
  const auth = useAuth();
  const [composing, setComposing] = createSignal<string | null>(null);
  const [preparing, setPreparing] = createSignal(false);

  const share = async () => {
    const s = props.session;
    const item = props.item;
    if (!s || preparing()) return;
    setPreparing(true);
    const cover = await hostedCover(s, item);
    setPreparing(false);
    const alt = item.Type === "Audio" || item.Type === "Episode"
      ? [item.Album, item.AlbumArtist].filter(Boolean).join(" – ") || item.Name
      : [item.Name, item.AlbumArtist].filter(Boolean).join(" – ");
    const bb = (cover ? `[img ${bbAlt(alt)}]${cover}[/img]\n` : "") + statusText(item, t);
    // Same rule PostComposer uses for a new post's format
    setComposing(bbcodeToInsert(bb, isFeatureEnabled("markdown") ? "text/markdown" : "text/bbcode"));
  };

  return (
    <>
      <Show when={props.icon} fallback={
        <button type="button" onClick={() => void share()} disabled={preparing() || !props.session} class={ghostPill}>
          <MdOutlineShare size={18} /> {preparing() ? t("jellyfin.share_preparing") : t("jellyfin.share")}
        </button>
      }>
        <button type="button" onClick={() => void share()} disabled={preparing() || !props.session}
          title={t("jellyfin.share")} aria-label={t("jellyfin.share")}
          class={`${iconBtn} ${preparing() ? "animate-pulse" : ""}`}>
          <MdOutlineShare size={20} />
        </button>
      </Show>
      <Show when={composing()}>
        {(body) => (
          <PostComposer
            open={true}
            onClose={() => setComposing(null)}
            onPosted={() => setComposing(null)}
            profileUid={auth()?.uid ?? 0}
            initialBody={body()}
            // Own draft scope so a share never clobbers the regular post draft
            scopeKey="jellyfin:share"
          />
        )}
      </Show>
    </>
  );
}
