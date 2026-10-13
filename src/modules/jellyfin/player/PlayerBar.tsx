// The music player, at rest: a floating bar at the foot of the library.
// Its top edge is the progress line. Tapping the cover or title opens the
// full player.
import { Show } from "solid-js";
import { MdFillPlay_arrow, MdFillPause, MdFillSkip_next, MdFillSkip_previous, MdFillKeyboard_arrow_up, MdFillVolume_up, MdFillVolume_off } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { imageUrl } from "../api";
import {
  current, currentSession, playing, loading, position, displayDuration, hasNext,
  toggle, next, prev, volume, muted, setVolume, setMuted,
} from "../store";
import { party, partyKind } from "../syncplay";
import { Art, iconBtn } from "../ui";
import { Motion, Presence, slideUp } from "../anim";
import { openPlayer } from "../chrome/player-ui";
import { MdOutlineGroups } from "solid-icons/md";

export default function PlayerBar() {
  const { t } = useI18n();
  const pct = () => (displayDuration() ? Math.min(100, (position() / displayDuration()) * 100) : 0);

  return (
    <Presence>
      <Show when={current()}>
        {(track) => (
          <Motion.div {...slideUp}
            class="sticky bottom-[4.75rem] lg:bottom-4 z-30 mt-10 rounded-2xl bg-surface/85 backdrop-blur-xl shadow-xl ring-1 ring-rim/40 overflow-hidden">
            <div class="h-0.5 bg-elevated/60" aria-hidden="true">
              <div class="h-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${pct()}%` }} />
            </div>
            <div class="flex items-center gap-3 p-2 pr-3">
              <button type="button" onClick={() => openPlayer()} class="flex flex-1 min-w-0 items-center gap-3 text-left rounded-xl"
                aria-label={t("jellyfin.open_player")}>
                <Art src={currentSession() ? imageUrl(currentSession()!, track(), 96) : null} class="w-11 h-11" />
                <span class="min-w-0">
                  <span class="flex items-center gap-1.5 text-sm text-txt">
                    <Show when={party() && partyKind() === "audio"}>
                      <MdOutlineGroups size={14} class="shrink-0 text-accent-txt" title={party()!.name} />
                    </Show>
                    <span class="truncate">{track().Name}</span>
                  </span>
                  <span class="block text-xs text-muted truncate">{track().Artists?.join(", ") || track().AlbumArtist}</span>
                </span>
              </button>

              <div class="flex items-center">
                <button type="button" class={`${iconBtn} hidden sm:inline-flex`} title={t("jellyfin.previous")} onClick={prev}>
                  <MdFillSkip_previous size={22} />
                </button>
                <button type="button" onClick={toggle} title={playing() ? t("jellyfin.pause") : t("jellyfin.play")}
                  class={`mx-1 inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent text-accent-fg hover:brightness-110 transition ${loading() ? "animate-pulse" : ""}`}>
                  <Show when={playing()} fallback={<MdFillPlay_arrow size={24} />}><MdFillPause size={24} /></Show>
                </button>
                <button type="button" class={iconBtn} title={t("jellyfin.next")} onClick={next} disabled={!hasNext()}>
                  <MdFillSkip_next size={22} />
                </button>
              </div>

              <div class="hidden md:flex items-center gap-1 w-36">
                <button type="button" class={iconBtn} title={muted() ? t("jellyfin.unmute") : t("jellyfin.mute")} onClick={() => setMuted(!muted())}>
                  <Show when={muted() || volume() === 0} fallback={<MdFillVolume_up size={18} />}><MdFillVolume_off size={18} /></Show>
                </button>
                <input type="range" min="0" max="1" step="0.05" value={muted() ? 0 : volume()}
                  onInput={(e) => setVolume(Number(e.currentTarget.value))} aria-label={t("jellyfin.volume")}
                  class="flex-1 min-w-0 h-1 accent-[var(--color-accent)]" />
              </div>

              <button type="button" class={iconBtn} title={t("jellyfin.open_player")} onClick={() => openPlayer()}>
                <MdFillKeyboard_arrow_up size={22} />
              </button>
            </div>
          </Motion.div>
        )}
      </Show>
    </Presence>
  );
}
