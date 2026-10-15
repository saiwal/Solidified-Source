// "Listening now" on a channel page — what the page owner's Jellyfin player
// last pushed to the hub (Handlers/JellyfinNowPlaying.php decides who may see
// it). Polls once a minute.
import { Show } from "solid-js";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { MdFillMusic_note } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

interface NowPlaying {
  track: { title: string; artist: string; album: string; cover: string };
  paused: boolean;
  updated: number;
}

async function fetchNowPlaying(nick: string): Promise<NowPlaying | null> {
  const r = await apiFetch(`/spa/jellyfin-nowplaying?channel=${encodeURIComponent(nick)}`);
  if (!r.ok) return null;
  return (await r.json()).data ?? null;
}

export default function ProfileNowPlaying() {
  const { t } = useI18n();
  const nick = usePageNick();
  const q = useQuery(() => ({
    queryKey: ["jellyfin-profile", "nowplaying", nick()],
    queryFn: () => fetchNowPlaying(nick()),
    enabled: !!nick(),
    // Most owners never opt in: check rarely while there's nothing to show
    refetchInterval: (query) => (query.state.data ? 60_000 : 5 * 60_000),
    staleTime: 30_000,
    retry: false,
  }));

  return (
    <Show when={q.data}>
      {(np) => (
        <section class="flex items-center gap-3 p-3 rounded-xl border border-rim bg-surface">
          <Show when={np().track.cover}
            fallback={<div class="w-12 h-12 shrink-0 rounded-lg bg-elevated flex items-center justify-center text-muted"><MdFillMusic_note size={22} /></div>}>
            <img src={np().track.cover} alt="" class="w-12 h-12 shrink-0 rounded-lg object-cover bg-elevated" />
          </Show>
          <div class="min-w-0 flex-1">
            <p class="text-[0.6875rem] uppercase tracking-wide text-muted flex items-center gap-1">
              <Show when={!np().paused}><span class="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /></Show>
              {np().paused ? t("jellyfin.profile_paused") : t("jellyfin.profile_listening")}
            </p>
            <p class="text-sm font-medium text-txt truncate">{np().track.title}</p>
            <p class="text-xs text-muted truncate">
              {np().track.artist}<Show when={np().track.album}> · {np().track.album}</Show>
            </p>
          </div>
        </section>
      )}
    </Show>
  );
}
