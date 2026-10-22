// Lyrics for the playing track. Synced (LRC-style, each line has a Start)
// lyrics highlight and follow the current line; plain ones just scroll.
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { MdFillText_decrease, MdFillText_increase } from "solid-icons/md";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { useI18n } from "@utsukta/spa-core/i18n";
import { getLyrics, type JellyfinSession } from "./api";
import { position } from "./store";
import { jfQuery } from "./library/common";
import { IconButton } from "@ui/Button";

const TICKS = 10_000_000;

// Font sizes the zoom buttons step through; the choice is kept per browser.
const SIZES = ["text-base", "text-lg", "text-xl", "text-2xl", "text-3xl"];
const SIZE_KEY = "hz-jellyfin-lyrics-size";
const readSize = () => {
  try {
    const n = Number(localStorage.getItem(SIZE_KEY));
    return Number.isInteger(n) && n >= 0 && n < SIZES.length && localStorage.getItem(SIZE_KEY) !== null ? n : 1;
  } catch {
    return 1;
  }
};
const [size, setSizeSignal] = createSignal(readSize());
const setSize = (n: number) => {
  const v = Math.max(0, Math.min(SIZES.length - 1, n));
  setSizeSignal(v);
  try { localStorage.setItem(SIZE_KEY, String(v)); } catch { /* this page load only */ }
};

export default function Lyrics(props: { s: JellyfinSession; itemId: string }) {
  const { t } = useI18n();
  const q = useQuery(() => ({
    queryKey: ["jellyfin", props.s.server, props.s.userId, "lyrics", props.itemId],
    queryFn: () => getLyrics(props.s, props.itemId),
    ...jfQuery,
  }));
  const lines = () => q.data ?? [];
  const synced = () => lines().some((l) => (l.Start ?? 0) > 0);
  const active = createMemo(() => {
    if (!synced()) return -1;
    const ticks = position() * TICKS;
    let i = -1;
    lines().forEach((l, n) => { if ((l.Start ?? 0) <= ticks) i = n; });
    return i;
  });

  let box: HTMLDivElement | undefined;
  const refs: HTMLElement[] = [];
  // Scroll the box itself (not the page) to keep the active line centred —
  // also after a zoom, which moves every line
  createEffect(() => {
    size();
    const el = refs[active()];
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  });

  return (
    <Show when={!q.isPending} fallback={<p class="text-sm text-muted animate-pulse">{t("jellyfin.loading")}</p>}>
      <Show when={lines().length} fallback={<p class="text-sm text-muted">{t("jellyfin.no_lyrics")}</p>}>
        <div class="relative">
          <div class="absolute top-0 right-0 z-10 flex gap-0.5 rounded-full bg-surface/70 backdrop-blur p-0.5">
            <IconButton
              label={t("jellyfin.lyrics_smaller")}
              size="sm"
              disabled={size() === 0}
              onClick={() => setSize(size() - 1)}
            >
              <MdFillText_decrease size={16} />
            </IconButton>
            <IconButton
              label={t("jellyfin.lyrics_larger")}
              size="sm"
              disabled={size() === SIZES.length - 1}
              onClick={() => setSize(size() + 1)}
            >
              <MdFillText_increase size={16} />
            </IconButton>
          </div>
          <div ref={box} class="relative max-h-[60vh] lg:max-h-[calc(86vh-10rem)] overflow-y-auto px-10 py-3 text-center space-y-3 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]">
            {/* Room above and below so the first and last lines can sit in the middle too */}
            <Show when={synced()}><div class="h-32" aria-hidden="true" /></Show>
            <For each={lines()}>
              {(l, i) => (
                <p ref={(el) => (refs[i()] = el)}
                  class={`${SIZES[size()]} leading-snug transition-all duration-300 motion-reduce:transition-none ${
                    !synced() ? "text-txt" : i() === active() ? "text-accent-txt font-medium scale-105" : "text-muted/60"
                  }`}>
                  {l.Text || "♪"}
                </p>
              )}
            </For>
            <Show when={synced()}><div class="h-32" aria-hidden="true" /></Show>
          </div>
        </div>
      </Show>
    </Show>
  );
}
