// The full player: one quiet room around the music. The cover, large, on a
// slow-breathing wash of itself; the controls beneath; and beside them (below,
// on a phone) the queue, the lyrics or the party.
import { Show, Switch, Match, createEffect, onCleanup, lazy } from "solid-js";
import {
  MdFillPlay_arrow, MdFillPause, MdFillSkip_next, MdFillSkip_previous, MdFillShuffle, MdFillRepeat,
  MdFillRepeat_one, MdFillVolume_up, MdFillVolume_off, MdFillKeyboard_arrow_down, MdOutlineStop_circle, MdOutlineGraphic_eq,
} from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Modal } from "@ui/Modal";
import { imageUrl } from "../api";
import {
  currentSession, current, queue, index, playing, position, displayDuration, loading, error,
  volume, muted, repeat, shuffled, hasNext,
  toggle, next, prev, seek, stop, setVolume, setMuted, cycleRepeat, toggleShuffle,
} from "../store";
import { party } from "../syncplay";
import { fmtTime, Art } from "../ui";
import { Motion, fade, pop } from "../anim";
import ShareButton from "../share";
import Lyrics from "../Lyrics";
import PartyBar from "../party/PartyBar";
import FavoriteButton from "../library/FavoriteButton";
import TrackMenu from "../library/TrackMenu";
import Queue from "./Queue";
import { fullOpen, setFullOpen, fullTab, setFullTab, visualizerOn, toggleVisualizer, type PlayerTab } from "../chrome/player-ui";
import { IconButton } from "@ui/Button";
import { EmptyState } from "@ui/EmptyState";

const Visualizer = lazy(() => import("./Visualizer"));

const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The cover, blurred and enlarged behind everything, drifting very slowly. */
function Ambient(props: { src: string | null }) {
  let el: HTMLImageElement | undefined;
  createEffect(() => {
    if (!el || !props.src || reducedMotion()) return;
    const a = el.animate(
      [{ transform: "scale(1.35) rotate(0deg)" }, { transform: "scale(1.55) rotate(4deg)" }],
      { duration: 24_000, iterations: Infinity, direction: "alternate", easing: "ease-in-out" },
    );
    onCleanup(() => a.cancel());
  });
  return (
    <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <Show when={props.src}>
        <img ref={el} src={props.src!} alt="" class="absolute inset-0 w-full h-full object-cover blur-3xl opacity-40 saturate-150 scale-[1.35]" />
      </Show>
      <div class="absolute inset-0 bg-gradient-to-b from-surface/40 via-surface/70 to-surface" />
    </div>
  );
}

const TABS: { id: PlayerTab; label: "jellyfin.tab_queue" | "jellyfin.lyrics" | "jellyfin.tab_party" }[] = [
  { id: "queue", label: "jellyfin.tab_queue" },
  { id: "lyrics", label: "jellyfin.lyrics" },
  { id: "party", label: "jellyfin.tab_party" },
];

export default function FullPlayer() {
  const { t } = useI18n();
  // Nothing to show once the music stops
  createEffect(() => { if (!current()) setFullOpen(false); });


  return (
    <Show when={fullOpen() && current()}>
      <Modal onClose={() => setFullOpen(false)} label={t("jellyfin.now_playing")} bare
        class="fixed inset-0 z-[70] m-0 h-dvh w-screen max-h-none max-w-none bg-black/40 p-0 lg:p-8 flex items-stretch lg:items-center justify-center">
        <Motion.div {...pop}
          class="relative w-full lg:max-w-6xl h-full lg:h-[86vh] lg:rounded-3xl overflow-hidden bg-surface shadow-2xl text-txt">
          <Ambient src={currentSession() && current() ? imageUrl(currentSession()!, current()!, 600) : null} />

          <div class="relative h-full overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <IconButton
              label={t("jellyfin.close")}
              class="absolute top-3 right-3 z-10"
              onClick={() => setFullOpen(false)}
            >
              <MdFillKeyboard_arrow_down size={26} />
            </IconButton>

            {/* ── the music ── */}
            <Show when={current()}>
              {(track) => (
                <section class="flex flex-col items-center justify-center gap-6 px-6 pt-14 pb-8 lg:p-12">
                  <Show when={track().Id} keyed>
                    {(_id) => (
                      <Motion.div {...fade} class="w-full max-w-[min(22rem,70vw)]">
                        <Art src={currentSession() ? imageUrl(currentSession()!, track(), 600) : null}
                          class="w-full aspect-square !rounded-2xl shadow-2xl" />
                      </Motion.div>
                    )}
                  </Show>

                  <div class="w-full max-w-md text-center space-y-1">
                    <h2 class="text-xl sm:text-2xl font-semibold text-txt">{track().Name}</h2>
                    <p class="text-muted">{track().Artists?.join(", ") || track().AlbumArtist}</p>
                    <Show when={track().Album}><p class="text-sm text-muted/80">{track().Album}</p></Show>
                  </div>

                  <div class="w-full max-w-md">
                    <input type="range" min="0" max={displayDuration() || 0} step="1" value={position()}
                      onInput={(e) => seek(Number(e.currentTarget.value))} aria-label={t("jellyfin.seek")}
                      class="w-full h-1 accent-[var(--color-accent)]" />
                    <div class="flex justify-between text-xs text-muted tabular-nums mt-1">
                      <span>{fmtTime(position())}</span>
                      <span>{displayDuration() ? fmtTime(displayDuration()) : "–:––"}</span>
                    </div>
                  </div>

                  <Show when={error()}><p class="text-sm text-danger-txt">{t("jellyfin.err_playback")}</p></Show>

                  <div class="flex items-center gap-2 sm:gap-4">
                    <IconButton label={t("jellyfin.shuffle")} pressed={shuffled()} onClick={toggleShuffle}>
                      <MdFillShuffle size={20} />
                    </IconButton>
                    <IconButton label={t("jellyfin.previous")} onClick={prev}>
                      <MdFillSkip_previous size={30} />
                    </IconButton>
                    <button type="button" onClick={toggle} title={playing() ? t("jellyfin.pause") : t("jellyfin.play")}
                      class={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent text-accent-fg shadow-lg hover:brightness-110 transition ${loading() ? "animate-pulse" : ""}`}>
                      <Show when={playing()} fallback={<MdFillPlay_arrow size={36} />}><MdFillPause size={36} /></Show>
                    </button>
                    <IconButton label={t("jellyfin.next")} onClick={next} disabled={!hasNext()}>
                      <MdFillSkip_next size={30} />
                    </IconButton>
                    <IconButton
                      label={t(repeat() === "one" ? "jellyfin.repeat_one" : repeat() === "all" ? "jellyfin.repeat_all" : "jellyfin.repeat_off")}
                      pressed={repeat() !== "off"}
                      onClick={cycleRepeat}
                    >
                      <Show when={repeat() === "one"} fallback={<MdFillRepeat size={20} />}><MdFillRepeat_one size={20} /></Show>
                    </IconButton>
                  </div>

                  <Show when={visualizerOn()}>
                    <div class="w-full max-w-md"><Visualizer /></div>
                  </Show>

                  <div class="flex flex-wrap items-center justify-center gap-1">
                    <Show when={currentSession()}>
                      {(s) => (
                        <>
                          <FavoriteButton s={s()} item={track()} size={20} />
                          <ShareButton session={s()} item={track()} icon />
                          <TrackMenu s={s()} tracks={[track()]} mixSeed={track()} />
                        </>
                      )}
                    </Show>
                    <IconButton
                      label={t("jellyfin.visualizer")}
                      pressed={visualizerOn()}
                      onClick={toggleVisualizer}
                    >
                      <MdOutlineGraphic_eq size={20} />
                    </IconButton>
                    <IconButton
                      label={t("jellyfin.close_player")}
                      onClick={() => { setFullOpen(false); stop(); }}
                    >
                      <MdOutlineStop_circle size={20} />
                    </IconButton>
                    <span class="mx-2 h-5 w-px bg-rim/60" aria-hidden="true" />
                    <IconButton
                      label={muted() ? t("jellyfin.unmute") : t("jellyfin.mute")}
                      onClick={() => setMuted(!muted())}
                    >
                      <Show when={muted() || volume() === 0} fallback={<MdFillVolume_up size={20} />}><MdFillVolume_off size={20} /></Show>
                    </IconButton>
                    <input type="range" min="0" max="1" step="0.05" value={muted() ? 0 : volume()}
                      onInput={(e) => setVolume(Number(e.currentTarget.value))} aria-label={t("jellyfin.volume")}
                      class="w-24 h-1 accent-[var(--color-accent)]" />
                  </div>
                </section>
              )}
            </Show>

            {/* ── queue · lyrics · party ── */}
            <section class="flex flex-col min-h-0 px-4 pb-8 lg:py-12 lg:pr-12 lg:pl-0">
              <div role="tablist" class="flex gap-6 px-2 mb-4">
                {TABS.map((tab) => (
                  <button type="button" role="tab" aria-selected={fullTab() === tab.id} onClick={() => setFullTab(tab.id)}
                    class={`relative pb-1.5 text-sm transition-colors ${fullTab() === tab.id ? "text-txt" : "text-muted hover:text-txt"}`}>
                    {t(tab.label)}
                    <Show when={tab.id === "queue"}><span class="ml-1.5 text-xs text-muted tabular-nums">{index() + 1}/{queue().length}</span></Show>
                    <Show when={tab.id === "party" && party()}><span class="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" /></Show>
                    <span class={`absolute left-0 bottom-0 h-0.5 rounded-full bg-accent transition-all duration-300 ${fullTab() === tab.id ? "w-full" : "w-0"}`} />
                  </button>
                ))}
              </div>
              <div class="flex-1 min-h-0 lg:overflow-y-auto pr-1">
                <Show when={fullTab()} keyed>
                  {(tab) => (
                    <Motion.div {...fade}>
                      <Switch>
                        <Match when={tab === "queue"}><Queue /></Match>
                        <Match when={tab === "lyrics"}>
                          <Show when={current()?.HasLyrics && currentSession()} fallback={<EmptyState class="px-2">{t("jellyfin.no_lyrics")}</EmptyState>}>
                            <Lyrics s={currentSession()!} itemId={current()!.Id} />
                          </Show>
                        </Match>
                        <Match when={tab === "party"}>
                          <PartyBar s={currentSession()} kind="audio" title={current()?.Name ?? ""}
                            media={() => ({ ids: queue().map((q) => q.Id), index: index(), startSec: position() })} />
                        </Match>
                      </Switch>
                    </Motion.div>
                  )}
                </Show>
              </div>
            </section>
          </div>
        </Motion.div>
      </Modal>
    </Show>
  );
}
