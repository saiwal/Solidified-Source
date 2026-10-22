// Film / episode player on /jellyfin?watch=<id>[&t=<seconds>].
//
// Jellyfin's PlaybackInfo, fed this browser's real codec support, decides
// between direct play (the file as-is) and an HLS transcode; HLS plays
// natively on Safari and through hls.js (its light build, lazy-loaded, only
// here) elsewhere.
// Text subtitles ride along as <track>s; image subtitles (PGS, VobSub) and a
// non-default audio track need the server, so picking one restarts the stream
// at the current position with that burned in / selected.
import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { MdFillReplay, MdFillSkip_next, MdOutlinePhoto_camera, MdOutlineContent_cut } from "solid-icons/md";
import { toast } from "@utsukta/spa-core/store/toast";
import ClipStrip from "./ClipStrip";
import CaptureDialog from "./CaptureDialog";
import { screenshot, fileStem } from "./capture";
import { Art, iconBtn } from "../ui";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  getItem, playbackInfo, withApiKey, directVideoUrl, reportVideo, stopEncoding, nextEpisode, ticksToSeconds, episodes, imageUrl,
  type JellyfinSession, type JfItem, type JfMediaSource, type JfMediaStream,
} from "../api";
import { pauseForVideo as pauseMusic } from "../store";
import { jfQuery, BackLink, Loading, QueryError } from "../library/common";
import FavoriteButton from "../library/FavoriteButton";
import ShareButton from "../share";
import { setVideoActive } from "./state";
import {
  party, partyWants, partyIsActing, partyRequest, attachVideo, videoReloading, videoReloaded,
} from "../syncplay";
import PartyBar from "../party/PartyBar";
import { Motion, fade } from "../anim";
import type Hls from "hls.js/light";
import { Button, IconButton } from "@ui/Button";
import { Select } from "@ui/Field";

interface Loaded {
  playSessionId: string;
  source: JfMediaSource;
  transcoding: boolean;
  audioIndex?: number;
  /** Burned-in (image) subtitle, if any. */
  burnedSubtitle?: number;
}

/** "S1E2 · Title" for episodes, the plain name otherwise. */
export function videoTitle(i: JfItem): string {
  if (i.Type !== "Episode") return i.Name;
  const se = i.ParentIndexNumber != null && i.IndexNumber != null ? `S${i.ParentIndexNumber}E${i.IndexNumber} · ` : "";
  return `${se}${i.Name}`;
}

export default function VideoPlayer(props: { s: JellyfinSession; id: string; startAt?: number }) {
  const { t } = useI18n();
  const [, setParams] = useSearchParams();
  const item = useQuery(() => ({ queryKey: ["jellyfin", props.s.server, props.s.userId, "item", props.id], queryFn: () => getItem(props.s, props.id), ...jfQuery }));

  let video!: HTMLVideoElement;
  let hls: Hls | null = null;
  const [loaded, setLoaded] = createSignal<Loaded | null>(null);
  const [error, setError] = createSignal(false);
  const [ended, setEnded] = createSignal(false);
  const [next, setNext] = createSignal<JfItem | null>(null);
  /** Selected text subtitle (MediaStream.Index), -1 = off. */
  const [textSub, setTextSub] = createSignal(-1);
  const [resumedFrom, setResumedFrom] = createSignal(0);

  let started = false;
  let lastReport = 0;

  const report = (kind: "start" | "progress" | "stop") => {
    const l = loaded();
    if (!l) return;
    reportVideo(props.s, kind, {
      itemId: props.id, mediaSourceId: l.source.Id, playSessionId: l.playSessionId,
      seconds: video?.currentTime ?? 0, paused: video?.paused ?? true, transcoding: l.transcoding,
      audioIndex: l.audioIndex, subtitleIndex: l.burnedSubtitle ?? (textSub() >= 0 ? textSub() : undefined),
    });
    lastReport = Date.now();
  };

  /** End the current stream: report it stopped and free the transcoder. */
  const teardown = () => {
    const l = loaded();
    if (l && started) report("stop");
    if (l?.transcoding) void stopEncoding(props.s, l.playSessionId);
    hls?.destroy();
    hls = null;
    started = false;
  };

  /** In a watch party, for this item: the group decides play/pause/seek. */
  const partyHere = () => !!party() && partyWants(props.id);
  /**
   * Native-control events count as the *user's* only once a load has settled —
   * hls.js seeks to its start position on its own, and that must not become a
   * Seek request to the whole party.
   */
  let userEvents = false;
  // Removing a <video> pauses it, and that "pause" lands after unmount: it
  // must not pause the whole party for everyone when this viewer leaves.
  onCleanup(() => { userEvents = false; });

  /** Load the stream at `startAt`; `autoplay` false leaves it paused (party). Resolves once it can play. */
  const load = async (startAt: number, opts: { audioIndex?: number; burnedSubtitle?: number } = {}, autoplay = true): Promise<void> => {
    userEvents = false;
    teardown();
    setError(false);
    setEnded(false);
    try {
      const defaultAudio = loaded()?.source.DefaultAudioStreamIndex;
      const nonDefaultAudio = opts.audioIndex !== undefined && opts.audioIndex !== defaultAudio;
      const pi = await playbackInfo(props.s, props.id, {
        audioIndex: opts.audioIndex,
        subtitleIndex: opts.burnedSubtitle,
        // A browser can't switch audio tracks inside a file, and can't draw
        // image subtitles: both need the server's transcoder.
        forceTranscode: nonDefaultAudio || opts.burnedSubtitle !== undefined,
      });
      const source = pi.MediaSources[0];
      if (!source) throw new Error("no media source");
      const transcoding = !source.SupportsDirectPlay;
      if (transcoding && !source.TranscodingUrl) throw new Error("not playable");
      setLoaded({ playSessionId: pi.PlaySessionId, source, transcoding, ...opts });
      pauseMusic();

      const url = transcoding ? withApiKey(props.s, source.TranscodingUrl!) : directVideoUrl(props.s, props.id, source, pi.PlaySessionId);
      if (transcoding && !video.canPlayType("application/vnd.apple.mpegurl")) {
        // The light build: no in-stream subtitles, alternate audio or DRM — we
        // use <track> for subtitles and the server for audio-track switching
        const { default: HlsCtor } = await import("hls.js/light");
        if (!HlsCtor.isSupported()) throw new Error("no MSE");
        hls = new HlsCtor({ startPosition: startAt });
        hls.on(HlsCtor.Events.ERROR, (_e, d) => { if (d.fatal) setError(true); });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        video.src = url;
        if (startAt) video.addEventListener("loadedmetadata", () => { video.currentTime = startAt; }, { once: true });
      }
      if (autoplay) video.play().catch(() => undefined); // autoplay refusal — native controls take over
      await new Promise<void>((res) => {
        const done = () => { video.removeEventListener("canplay", done); res(); };
        video.addEventListener("canplay", done);
        setTimeout(done, 15_000);
      });
    } catch {
      setError(true);
    }
    setTimeout(() => { userEvents = true; }, 500);
  };

  /** A subtitle/audio switch reloads the stream; in a party, hold the group meanwhile. */
  const reload = async (at: number, opts: { audioIndex?: number; burnedSubtitle?: number }) => {
    if (!partyHere()) return load(at, opts);
    videoReloading();
    await load(at, opts, false);
    videoReloaded();
  };

  onMount(() => {
    setVideoActive(true);
    video.addEventListener("playing", () => {
      if (!started) { started = true; report("start"); }
    });
    video.addEventListener("pause", () => { if (started) report("progress"); });
    video.addEventListener("timeupdate", () => { if (started && Date.now() - lastReport > 10_000) report("progress"); });
    video.addEventListener("error", () => { if (!hls) setError(true); });
    // In a party the native controls ask the group instead of acting: undo the
    // local play/pause, request it, and act when the server says so.
    let reverting = false;
    const userAct = () => partyHere() && userEvents && !partyIsActing() && !reverting;
    video.addEventListener("play", () => {
      if (!userAct()) return;
      reverting = true;
      video.pause();
      setTimeout(() => { reverting = false; }, 300);
      partyRequest.unpause();
    });
    video.addEventListener("pause", () => {
      if (userAct() && !video.ended) partyRequest.pause();
    });
    video.addEventListener("seeking", () => {
      if (userAct()) partyRequest.seek(video.currentTime);
    });
    onCleanup(attachVideo({ itemId: props.id, el: () => video, load: (at) => load(at, {}, false) }));

    video.addEventListener("ended", () => {
      // A party's queue is just this episode: move the whole party on ourselves
      if (partyHere()) { if (next()) goNext(); return; }
      setEnded(true);
    });
  });

  // An episode's successor, looked up as soon as it opens — so "Next episode"
  // is available throughout, not only once it has ended.
  createEffect(() => {
    const it = item.data;
    if (it?.Type === "Episode" && it.SeriesId) {
      nextEpisode(props.s, it.SeriesId, it.Id).then(setNext).catch(() => undefined);
    }
  });

  const goNext = () => {
    const n = next();
    if (!n) return;
    if (partyHere()) partyRequest.newQueue([n.Id], 0, 0);
    else setParams({ watch: n.Id, t: undefined });
  };

  // Start once the item is known: ?t= wins, else resume from Jellyfin's saved
  // position unless it's near the end (finished — start over).
  let kicked = false;
  createEffect(() => {
    const it = item.data;
    if (!it || kicked) return;
    kicked = true;
    if (partyWants(props.id)) return; // the party loads it, at the group's position
    let at = props.startAt ?? ticksToSeconds(it.UserData?.PlaybackPositionTicks);
    const runtime = ticksToSeconds(it.RunTimeTicks);
    if (runtime && at > runtime * 0.95) at = 0;
    setResumedFrom(at);
    void load(at);
  });

  // Show the chosen text track, hide the rest. Tracks render in textSubs() order.
  createEffect(() => {
    const chosen = textSub();
    const subs = textSubs();
    loaded();
    queueMicrotask(() => {
      if (!video) return;
      Array.from(video.textTracks).forEach((tt, i) => { tt.mode = subs[i]?.Index === chosen ? "showing" : "disabled"; });
    });
  });

  onCleanup(() => {
    teardown();
    setVideoActive(false);
  });

  const streams = (type: string) => loaded()?.source.MediaStreams.filter((m) => m.Type === type) ?? [];
  const textSubs = () => streams("Subtitle").filter((m) => m.IsTextSubtitleStream && m.DeliveryUrl);
  const audioTracks = () => streams("Audio");
  const label = (m: JfMediaStream) => m.DisplayTitle || [m.Language, m.Codec].filter(Boolean).join(" · ") || `#${m.Index}`;

  const pickSubtitle = (v: string) => {
    const idx = Number(v);
    const m = streams("Subtitle").find((x) => x.Index === idx);
    const l = loaded();
    if (idx < 0 || m?.IsTextSubtitleStream) {
      setTextSub(idx);
      // Leaving a burned-in subtitle needs a fresh, clean stream
      if (l?.burnedSubtitle !== undefined) void reload(video.currentTime, { audioIndex: l.audioIndex });
    } else if (m) {
      setTextSub(-1);
      void reload(video.currentTime, { audioIndex: l?.audioIndex, burnedSubtitle: idx });
    }
  };

  const subValue = () => String(loaded()?.burnedSubtitle ?? textSub());
  const audioValue = () => String(loaded()?.audioIndex ?? loaded()?.source.DefaultAudioStreamIndex ?? audioTracks()[0]?.Index ?? "");

  // The season this episode belongs to, as a strip beneath the player
  const season = useQuery(() => ({
    queryKey: ["jellyfin", props.s.server, props.s.userId, "episodes", item.data?.SeriesId, item.data?.SeasonId],
    queryFn: () => episodes(props.s, item.data!.SeriesId!, item.data!.SeasonId!),
    enabled: !!item.data?.SeriesId && !!item.data?.SeasonId,
    ...jfQuery,
  }));

  // Screenshot & clip
  const [clipping, setClipping] = createSignal(false);
  const [captured, setCaptured] = createSignal<File | null>(null);
  const shoot = async () => {
    try {
      setCaptured(await screenshot(video, true, fileStem(item.data?.Name ?? "screenshot", video.currentTime)));
    } catch {
      toast.error(t("jellyfin.screenshot_failed"));
    }
  };

  const partyMedia = () => ({ ids: [props.id], index: 0, startSec: video?.currentTime ?? 0 });
  const partyTitle = () => (item.data ? videoTitle(item.data) : "");

  return (
    <div class="space-y-6">
      <BackLink />
      <div class={`grid gap-8 ${party() ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
        <div class="space-y-6 min-w-0">
          <div class="relative rounded-2xl overflow-hidden bg-black shadow-2xl">
            <video ref={video} controls playsinline crossorigin="anonymous" data-jf-video class="w-full aspect-video bg-black">
              <For each={textSubs()}>
                {(m) => <track kind="subtitles" src={withApiKey(props.s, m.DeliveryUrl!)} srclang={m.Language ?? ""} label={label(m)} />}
              </For>
            </video>
            <Show when={ended() && next()}>
              {(n) => (
                <Motion.div {...fade} class="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                  <Button onClick={goNext}>
                    <MdFillSkip_next size={20} /> {t("jellyfin.next_episode", { name: videoTitle(n()) })}
                  </Button>
                </Motion.div>
              )}
            </Show>
          </div>

          <Show when={error()}>
            <p class="text-sm text-danger-txt">{t("jellyfin.err_video")}</p>
          </Show>

          <Show when={!item.isError} fallback={<QueryError error={item.error} />}>
            <Show when={item.data} fallback={<Loading kind="rows" />}>
              {(it) => (
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="min-w-0 space-y-1">
                    <Show when={it().SeriesName}><p class="text-sm text-muted">{it().SeriesName}</p></Show>
                    <h2 class="text-xl font-bold text-txt break-words">{videoTitle(it())}</h2>
                    <Show when={it().Type === "Movie" && it().ProductionYear}><p class="text-sm text-muted">{it().ProductionYear}</p></Show>
                  </div>
                  <div class="flex items-center">
                    <FavoriteButton s={props.s} item={it()} size={20} />
                    <ShareButton session={props.s} item={it()} icon />
                  </div>
                </div>
              )}
            </Show>
          </Show>

          <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Show when={next()}>
              {(n) => (
                <Button class="max-w-full" onClick={goNext} title={videoTitle(n())}>
                  <MdFillSkip_next size={20} class="shrink-0" />
                  <span class="truncate">{t("jellyfin.next_episode", { name: videoTitle(n()) })}</span>
                </Button>
              )}
            </Show>
            <Show when={streams("Subtitle").length}>
              <label class="flex items-center gap-2 text-sm text-muted">
                {t("jellyfin.subtitles")}
                <Select
                  class="max-w-44"
                  value={subValue()}
                  onChange={(e) => pickSubtitle(e.currentTarget.value)}
                >
                  <option value="-1">{t("jellyfin.off")}</option>
                  <For each={streams("Subtitle")}>
                    {(m) => <option value={String(m.Index)}>{label(m)}{m.IsTextSubtitleStream ? "" : ` (${t("jellyfin.burned_in")})`}</option>}
                  </For>
                </Select>
              </label>
            </Show>
            <Show when={audioTracks().length > 1}>
              <label class="flex items-center gap-2 text-sm text-muted">
                {t("jellyfin.audio_track")}
                <Select
                  class="max-w-44"
                  value={audioValue()}
                  onChange={(e) => void reload(video.currentTime, { audioIndex: Number(e.currentTarget.value), burnedSubtitle: loaded()?.burnedSubtitle })}
                >
                  <For each={audioTracks()}>{(m) => <option value={String(m.Index)}>{label(m)}</option>}</For>
                </Select>
              </label>
            </Show>
            <Show when={resumedFrom() > 0}>
              <Button variant="ghost" onClick={() => {
                setResumedFrom(0);
                if (partyHere()) partyRequest.seek(0);
                else void load(0, { audioIndex: loaded()?.audioIndex, burnedSubtitle: loaded()?.burnedSubtitle });
              }}>
                <MdFillReplay size={18} /> {t("jellyfin.start_over")}
              </Button>
            </Show>
            <PartyBar mode="start" s={props.s} kind="video" title={partyTitle()} media={partyMedia} />
            <span class="flex items-center">
              <IconButton label={t("jellyfin.screenshot")} disabled={!loaded()} onClick={() => void shoot()}>
                <MdOutlinePhoto_camera size={20} />
              </IconButton>
              <button type="button" class={`${iconBtn} ${clipping() ? "!text-accent-txt" : ""}`} aria-pressed={clipping()}
                title={t("jellyfin.clip")} aria-label={t("jellyfin.clip")} disabled={!loaded()} onClick={() => setClipping(!clipping())}>
                <MdOutlineContent_cut size={20} />
              </button>
            </span>
            <Show when={loaded()}>
              {(l) => <span class="ml-auto text-xs text-muted/70">{l().transcoding ? t("jellyfin.transcoding") : t("jellyfin.direct_play")}</span>}
            </Show>
          </div>

          <Show when={clipping()}>
            <ClipStrip s={props.s} item={item.data} video={() => video} audioIndex={loaded()?.audioIndex}
              inParty={partyHere()} onClose={() => setClipping(false)}
              onDone={(f) => { setClipping(false); setCaptured(f); }} />
          </Show>
          <Show when={captured()} keyed>
            {(f) => <CaptureDialog file={f} item={item.data} onClose={() => setCaptured(null)} />}
          </Show>

          <Show when={item.data?.Overview}>
            <p class="max-w-prose text-sm leading-relaxed text-muted whitespace-pre-line">{item.data!.Overview}</p>
          </Show>

          <Show when={(season.data?.Items.length ?? 0) > 1}>
            <section class="space-y-3">
              <h3 class="text-sm font-semibold text-txt">{item.data?.SeasonName ?? t("jellyfin.episodes")}</h3>
              <div class="flex gap-4 overflow-x-auto pb-2 snap-x [scrollbar-width:thin]">
                <For each={season.data!.Items}>
                  {(ep) => {
                    const here = () => ep.Id === props.id;
                    return (
                      <button type="button" disabled={here()} aria-current={here() ? "true" : undefined}
                        onClick={() => partyHere() ? partyRequest.newQueue([ep.Id], 0, 0) : setParams({ watch: ep.Id, t: undefined })}
                        class="group w-48 shrink-0 snap-start text-left">
                        <div class={`rounded-xl transition ${here() ? "ring-2 ring-accent ring-offset-2 ring-offset-base" : ""}`}>
                          <Art src={imageUrl(props.s, ep, 300)} class="w-full aspect-video" />
                        </div>
                        <p class={`mt-2 text-sm truncate transition-colors ${here() ? "text-accent-txt" : "text-txt group-hover:text-accent-txt"}`}>{videoTitle(ep)}</p>
                      </button>
                    );
                  }}
                </For>
              </div>
            </section>
          </Show>
        </div>

        {/* A running party sits beside the picture on a wide screen, so the chat
            is in view while watching; below it on a phone. */}
        <Show when={party()}>
          <aside class="lg:sticky lg:top-4 self-start">
            <PartyBar mode="panel" s={props.s} kind="video" title={partyTitle()} media={partyMedia} />
          </aside>
        </Show>
      </div>
    </div>
  );
}
