// "Today / this week I listened to…" — a draft post built from Jellyfin's
// last-played dates across every signed-in server. Always goes through the
// composer: the user edits and posts it (or doesn't); nothing is auto-posted.
import type { useI18n } from "@utsukta/spa-core/i18n";
import { playedSince, type JfItem } from "./api";
import { servers } from "./store";

export type RecapPeriod = "day" | "week";

function since(period: RecapPeriod): Date {
  const d = new Date();
  if (period === "day") d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - 7);
  return d;
}

/** Top `n` keys by count, ties broken alphabetically. */
function top(counts: Map<string, number>, n: number): [string, number][] {
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

/** The recap as plain text (works in both bbcode and markdown composers), or null if nothing was played. */
export async function buildRecap(period: RecapPeriod, t: ReturnType<typeof useI18n>["t"]): Promise<string | null> {
  const results = await Promise.all(servers().map((s) => playedSince(s, since(period)).catch(() => [] as JfItem[])));
  const tracks = results.flat();
  if (!tracks.length) return null;

  const artists = new Map<string, number>();
  const albums = new Map<string, number>();
  for (const tr of tracks) {
    const a = tr.AlbumArtist || tr.Artists?.[0];
    if (a) artists.set(a, (artists.get(a) ?? 0) + 1);
    if (tr.Album) albums.set(tr.Album, (albums.get(tr.Album) ?? 0) + 1);
  }

  const head = t(period === "day" ? "jellyfin.recap_day_head" : "jellyfin.recap_week_head", { n: String(tracks.length) });
  const lines = [`🎧 ${head}`];
  const topArtists = top(artists, 5);
  if (topArtists.length) {
    lines.push("", t("jellyfin.recap_top_artists"));
    topArtists.forEach(([name, n], i) => lines.push(`${i + 1}. ${name} (${t("jellyfin.track_count", { n: String(n) })})`));
  }
  const topAlbums = top(albums, 3);
  if (topAlbums.length) {
    lines.push("", t("jellyfin.recap_top_albums"));
    topAlbums.forEach(([name]) => lines.push(`• ${name}`));
  }
  lines.push("", "#NowPlaying #ListeningRecap");
  return lines.join("\n");
}
