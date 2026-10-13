// Pushes what's playing to the hub for the profile widget, when the owner has
// opted in (settings.ts audience ≠ "off"). Local playback first; otherwise
// whatever another of the user's devices is playing.
//
// Pushes on track change and pause/resume (debounced), plus a heartbeat every
// 5 minutes while something plays — the hub treats a state older than 20
// minutes as stale, so a closed tab stops showing "now playing" on its own.
import { createEffect, on, onCleanup } from "solid-js";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { fetchCover, type JellyfinSession, type JfItem } from "./api";
import { current, currentSession, playing, sessionFor } from "./store";
import { remotePlaying } from "./remote";
import { audience, loadAudience } from "./settings";

const HEARTBEAT_MS = 5 * 60_000;
const covers = new Map<string, string>();

/** A ~96px cover as a data: URL — small enough to live in pconfig. */
async function thumb(s: JellyfinSession, item: JfItem): Promise<string> {
  const key = `${s.id}:${item.AlbumId ?? item.Id}`;
  if (covers.has(key)) return covers.get(key)!;
  const file = await fetchCover(s, item, 96).catch(() => null);
  if (!file) return "";
  const url = await new Promise<string>((res) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => res("");
    fr.readAsDataURL(file);
  });
  covers.set(key, url);
  return url;
}

interface Snapshot { s: JellyfinSession; item: JfItem; paused: boolean }

function snapshot(): Snapshot | null {
  const t = current(), s = currentSession();
  if (t && s) return { s, item: t, paused: !playing() };
  // The profile says "Listening now": music only, not someone's film
  const r = remotePlaying().find((x) => x.item?.Type === "Audio");
  const rs = r ? sessionFor(r.srv) : null;
  return r?.item && rs ? { s: rs, item: r.item, paused: r.paused } : null;
}

async function push(snap: Snapshot | null): Promise<void> {
  const track = snap
    ? {
        title: snap.item.Name,
        artist: snap.item.Artists?.join(", ") || snap.item.AlbumArtist || "",
        album: snap.item.Album ?? "",
        cover: await thumb(snap.s, snap.item),
      }
    : null;
  await apiFetch("/spa/jellyfin-nowplaying", {
    method: "POST",
    body: JSON.stringify({ track, paused: snap?.paused ?? false }),
  }).catch(() => undefined);
}

/** Mount once, in an always-present component (the global mini-player). */
export function usePresence(): void {
  void loadAudience();
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  createEffect(on(
    () => {
      if (audience() === "off") return "off";
      const snap = snapshot();
      return snap ? `${snap.s.id}:${snap.item.Id}:${snap.paused}` : "none";
    },
    (key) => {
      clearTimeout(debounce);
      clearInterval(heartbeat);
      if (key === "off") return;
      debounce = setTimeout(() => void push(snapshot()), 2000);
      if (key !== "none" && !key.endsWith(":true")) {
        heartbeat = setInterval(() => void push(snapshot()), HEARTBEAT_MS);
      }
    },
  ));

  onCleanup(() => {
    clearTimeout(debounce);
    clearInterval(heartbeat);
  });
}
