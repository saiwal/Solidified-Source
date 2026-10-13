// Screenshots and clips from the video player.
//
// Screenshot: the current frame drawn onto a canvas — the <video> is loaded
// with crossorigin="anonymous" and Jellyfin answers with CORS headers, so the
// canvas stays readable. Text subtitles aren't part of the picture (they're a
// <track> the browser overlays), so the visible cue is drawn on in the
// theme's own font. Image subtitles are already burned into the frames.
//
// Clip: Jellyfin transcodes the film to HLS (h264/aac, ≤720p); only the
// 3-second segments covering the clip are fetched — asking for segment N makes
// the server start transcoding there — then ffmpeg.wasm cuts them frame-exact
// into a small MP4 that plays everywhere, federated copies included. A
// separate DeviceId keeps the clip's transcode apart from the one the viewer
// may be watching.
import { playbackInfo, withApiKey, stopEncoding, type JellyfinSession } from "../api";
import { FFmpegWorker, FFMPEG_BASE } from "@/shared/lib/ffmpeg-client";

export const CLIP_MAX_SECONDS = 60;

// ── Screenshot ────────────────────────────────────────────────────────────────

/** Visible subtitle text, from whichever text track is showing. */
function currentCue(video: HTMLVideoElement): string {
  for (const track of Array.from(video.textTracks)) {
    if (track.mode !== "showing" || !track.activeCues) continue;
    const text = Array.from(track.activeCues)
      .map((c) => (c as VTTCue).text ?? "")
      .join("\n")
      .replace(/<[^>]+>/g, "") // WebVTT voice/italic tags
      .trim();
    if (text) return text;
  }
  return "";
}

/** Draw subtitle lines at the bottom centre, the way a player would. */
function drawSubtitle(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  const size = Math.round(h * 0.05);
  // The theme's font, not one of our choosing
  ctx.font = `600 ${size}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#fff";
  const maxWidth = w * 0.9;
  // Wrap long lines to the frame
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(tryLine).width > maxWidth && line) { lines.push(line); line = word; } else line = tryLine;
    }
    if (line) lines.push(line);
  }
  let y = h - h * 0.06;
  for (const line of lines.reverse()) {
    ctx.strokeText(line, w / 2, y, maxWidth);
    ctx.fillText(line, w / 2, y, maxWidth);
    y -= size * 1.25;
  }
}

export async function screenshot(video: HTMLVideoElement, withSubtitles: boolean, name: string): Promise<File> {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new Error("no frame");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, w, h);
  const cue = withSubtitles ? currentCue(video) : "";
  if (cue) drawSubtitle(ctx, cue, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
  if (!blob) throw new Error("encode failed");
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}

// ── Clip ──────────────────────────────────────────────────────────────────────

export type ClipPhase = "preparing" | "fetching" | "encoding";

interface Segment { url: string; start: number; end: number }

async function text(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** A transcoded HLS stream's media segments, with their start/end times. */
async function segmentsFor(s: JellyfinSession, itemId: string, audioIndex: number | undefined) {
  const pi = await playbackInfo(s, itemId, { forceTranscode: true, audioIndex });
  const src = pi.MediaSources[0];
  if (!src?.TranscodingUrl) throw new Error("not transcodable");
  const master = new URL(withApiKey(s, src.TranscodingUrl));
  master.searchParams.set("DeviceId", `${s.deviceId}-clip`);
  master.searchParams.set("MaxWidth", "1280");
  master.searchParams.set("VideoBitrate", "4000000");
  // Never stream-copy: copied video can only be cut on the source's keyframes
  // (often ~10s apart), so a segment the playlist says starts at 6s really
  // started at 10s and the clip's frames weren't in it. A real encode puts a
  // keyframe on every segment boundary.
  master.searchParams.set("AllowVideoStreamCopy", "false");
  master.searchParams.set("AllowAudioStreamCopy", "false");
  const variantPath = (await text(master.toString())).split("\n").find((l) => l && !l.startsWith("#"));
  if (!variantPath) throw new Error("empty master playlist");
  const variant = new URL(variantPath, master);
  const lines = (await text(variant.toString())).split("\n");
  const segs: Segment[] = [];
  let t = 0, dur = 0;
  for (const l of lines) {
    const m = /^#EXTINF:([\d.]+)/.exec(l);
    if (m) dur = Number(m[1]);
    else if (l && !l.startsWith("#")) { segs.push({ url: new URL(l, variant).toString(), start: t, end: t + dur }); t += dur; }
  }
  return { segs, playSessionId: pi.PlaySessionId };
}

/**
 * The transcoded MPEG-TS covering [start, start+len), joined into one stream,
 * plus where the clip begins inside it. Exported for the pipeline check.
 */
export async function fetchClipSource(
  s: JellyfinSession,
  itemId: string,
  start: number,
  len: number,
  audioIndex: number | undefined,
  onFetch?: (ratio: number) => void,
): Promise<{ data: Uint8Array; offset: number; playSessionId: string }> {
  const { segs, playSessionId } = await segmentsFor(s, itemId, audioIndex);
  const needed = segs.filter((g) => g.end > start && g.start < start + len);
  if (!needed.length) throw new Error("clip outside the video");
  const parts: Uint8Array[] = [];
  for (let i = 0; i < needed.length; i++) {
    onFetch?.(i / needed.length);
    const r = await fetch(needed[i].url);
    if (!r.ok) throw new Error(`segment HTTP ${r.status}`);
    parts.push(new Uint8Array(await r.arrayBuffer()));
  }
  // MPEG-TS segments concatenate into one valid stream
  const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { data.set(p, o); o += p.length; }
  return { data, offset: Math.max(0, start - needed[0].start), playSessionId };
}

/** ffmpeg arguments that cut `len` seconds from `offset` into a web-friendly MP4. */
export const clipArgs = (offset: number, len: number) => [
  // -ss *after* -i (decode and discard up to it): before -i, ffmpeg seeks an
  // MPEG-TS input against its own start time and landed a second late. The
  // input is at most one segment longer than the clip, so this costs little.
  "-i", "in.ts", "-ss", offset.toFixed(3), "-t", len.toFixed(3),
  // Re-encoded rather than stream-copied: copy can only cut on keyframes
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "out.mp4",
];

export async function makeClip(
  s: JellyfinSession,
  itemId: string,
  start: number,
  end: number,
  audioIndex: number | undefined,
  name: string,
  onPhase: (p: ClipPhase, ratio: number) => void,
): Promise<File> {
  const len = Math.min(CLIP_MAX_SECONDS, end - start);
  if (!(len > 0)) throw new Error("empty clip");
  onPhase("preparing", 0);
  const worker = new FFmpegWorker(FFMPEG_BASE + "ffmpeg-worker.js");
  let playSessionId = "";
  try {
    // The engine (about 31MB, cached after the first time) loads meanwhile
    const ready = worker.init(FFMPEG_BASE);
    const src = await fetchClipSource(s, itemId, start, len, audioIndex, (r) => onPhase("fetching", r));
    playSessionId = src.playSessionId;
    onPhase("encoding", 0);
    await ready;
    worker.onProgress = (ratio) => onPhase("encoding", ratio);
    await worker.write("in.ts", src.data.buffer as ArrayBuffer);
    const { ret } = await worker.exec(clipArgs(src.offset, len), len);
    if (ret !== 0) throw new Error(`ffmpeg exited ${ret}`);
    const out = await worker.read("out.mp4");
    return new File([out], `${name}.mp4`, { type: "video/mp4" });
  } finally {
    worker.terminate();
    if (playSessionId) void stopEncoding({ ...s, deviceId: `${s.deviceId}-clip` }, playSessionId);
  }
}

/** A safe-ish file name from a title. */
export const fileStem = (title: string, at: number) =>
  `${title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "clip"}-${Math.floor(at)}s`;
