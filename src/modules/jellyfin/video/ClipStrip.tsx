// Mark a clip: set its start and end from the playhead (or type them, to a
// tenth of a second), preview it, then create it. Clips are at most
// CLIP_MAX_SECONDS long.
import { Show, createSignal, onCleanup } from "solid-js";
import { MdOutlineFirst_page, MdOutlineLast_page, MdOutlinePlay_circle, MdOutlineClose } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import type { JellyfinSession, JfItem } from "../api";
import { fmtClock, parseClock, primaryPill, ghostPill, iconBtn } from "../ui";
import { CLIP_MAX_SECONDS, makeClip, fileStem, type ClipPhase } from "./capture";

export default function ClipStrip(props: {
  s: JellyfinSession;
  item: JfItem | undefined;
  video: () => HTMLVideoElement;
  audioIndex?: number;
  /** In a watch party the preview (local play) is off — it would move everyone. */
  inParty: boolean;
  onClose: () => void;
  onDone: (file: File) => void;
}) {
  const { t } = useI18n();
  const now = () => props.video().currentTime;
  const dur = () => props.video().duration || Infinity;
  const [start, setStartRaw] = createSignal(now());
  const [end, setEndRaw] = createSignal(Math.min(now() + 10, dur()));
  const [phase, setPhase] = createSignal<{ p: ClipPhase; r: number } | null>(null);

  // Keep start < end ≤ start + max, nudging the other edge rather than refusing
  const setStart = (v: number) => {
    const s = Math.max(0, Math.min(v, dur() - 0.1));
    setStartRaw(s);
    if (end() <= s || end() - s > CLIP_MAX_SECONDS) setEndRaw(Math.min(s + Math.min(10, CLIP_MAX_SECONDS), dur()));
  };
  const setEnd = (v: number) => {
    const e = Math.max(0.1, Math.min(v, dur()));
    setEndRaw(e);
    if (start() >= e || e - start() > CLIP_MAX_SECONDS) setStartRaw(Math.max(0, e - Math.min(10, CLIP_MAX_SECONDS)));
  };
  const length = () => end() - start();

  // Preview: play start → end once
  let stopAt: (() => void) | null = null;
  const preview = () => {
    const v = props.video();
    stopAt?.();
    v.currentTime = start();
    const onTime = () => { if (v.currentTime >= end()) { v.pause(); stopAt?.(); } };
    v.addEventListener("timeupdate", onTime);
    stopAt = () => { v.removeEventListener("timeupdate", onTime); stopAt = null; };
    void v.play();
  };
  onCleanup(() => stopAt?.());

  const create = async () => {
    if (phase()) return;
    setPhase({ p: "preparing", r: 0 });
    try {
      const file = await makeClip(props.s, props.item?.Id ?? "", start(), end(), props.audioIndex,
        fileStem(props.item?.Name ?? "clip", start()), (p, r) => setPhase({ p, r }));
      props.onDone(file);
    } catch {
      toast.error(t("jellyfin.clip_failed"));
    } finally {
      setPhase(null);
    }
  };

  // Long films get the hour field on every point, so they all read alike
  const long = () => isFinite(dur()) && dur() >= 3600;
  const clock = (sec: number) => fmtClock(sec, long());
  /** Commit a typed time; anything unreadable snaps back to the current value. */
  const commit = (el: HTMLInputElement, set: (v: number) => void, cur: () => number) => {
    const v = parseClock(el.value);
    if (v !== null) set(v);
    el.value = clock(cur());
  };

  const time = "w-24 bg-transparent border-0 border-b border-rim focus:border-accent outline-none py-1 text-sm text-txt tabular-nums text-center";
  const phaseLabel = () => {
    const p = phase();
    if (!p) return "";
    const pct = Math.round(p.r * 100);
    return p.p === "preparing" ? t("jellyfin.clip_preparing")
      : p.p === "fetching" ? t("jellyfin.clip_fetching", { pct: String(pct) })
      : t("jellyfin.clip_encoding", { pct: String(pct) });
  };

  return (
    <section class="basis-full space-y-3 p-4 rounded-2xl bg-elevated/40">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-txt">{t("jellyfin.clip")}</h3>
        <button type="button" class={iconBtn} title={t("jellyfin.close")} onClick={props.onClose} disabled={!!phase()}>
          <MdOutlineClose size={18} />
        </button>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div class="flex items-center gap-1">
          <button type="button" class={iconBtn} title={t("jellyfin.clip_set_start")} onClick={() => setStart(now())}>
            <MdOutlineFirst_page size={20} />
          </button>
          <input type="text" inputmode="decimal" value={clock(start())} aria-label={t("jellyfin.clip_start")}
            placeholder={long() ? "0:00:00.0" : "0:00.0"} title={t("jellyfin.clip_time_hint")}
            onChange={(e) => commit(e.currentTarget, setStart, start)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} class={time} />
        </div>
        <span class="text-muted" aria-hidden="true">–</span>
        <div class="flex items-center gap-1">
          <input type="text" inputmode="decimal" value={clock(end())} aria-label={t("jellyfin.clip_end")}
            placeholder={long() ? "0:00:00.0" : "0:00.0"} title={t("jellyfin.clip_time_hint")}
            onChange={(e) => commit(e.currentTarget, setEnd, end)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} class={time} />
          <button type="button" class={iconBtn} title={t("jellyfin.clip_set_end")} onClick={() => setEnd(now())}>
            <MdOutlineLast_page size={20} />
          </button>
        </div>
        <span class="text-sm text-muted tabular-nums">
          {t("jellyfin.clip_length", { n: length().toFixed(1), max: String(CLIP_MAX_SECONDS) })}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Show when={!props.inParty}>
          <button type="button" class={ghostPill} onClick={preview} disabled={!!phase()}>
            <MdOutlinePlay_circle size={18} /> {t("jellyfin.clip_preview")}
          </button>
        </Show>
        <button type="button" class={primaryPill} onClick={() => void create()} disabled={!!phase() || !props.item || length() <= 0}>
          {phase() ? phaseLabel() : t("jellyfin.clip_create")}
        </button>
      </div>
      <Show when={phase()}>
        {(p) => (
          <div class="h-1 rounded-full bg-elevated overflow-hidden" role="progressbar" aria-label={phaseLabel()}>
            <div class="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${p().p === "preparing" ? 5 : p().p === "fetching" ? 5 + p().r * 35 : 40 + p().r * 60}%` }} />
          </div>
        )}
      </Show>
      <p class="text-xs text-muted">{t("jellyfin.clip_note", { max: String(CLIP_MAX_SECONDS) })}</p>
    </section>
  );
}
