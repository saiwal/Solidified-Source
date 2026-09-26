import { createSignal, onCleanup, onMount, Show, For } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { davDirPath, uploadFile, listFolder, type FileMeta } from "@/modules/files/api";
import { MdOutlineMovie, MdFillCheck, MdFillFolder } from "solid-icons/md";
import { grabFrame } from "@/shared/editor/attachments/videoPoster";

const FFMPEG_BASE = import.meta.env.BASE_URL + "ffmpeg/";

// ── Worker-based FFmpeg wrapper ───────────────────────────────────────────────
class FFmpegWorker {
  private w: Worker;
  private pending = new Map<number, [(v: unknown) => void, (e: Error) => void]>();
  private seq = 0;
  onProgress?: (ratio: number) => void;

  constructor(url: string) {
    this.w = new Worker(url);
    this.w.onmessage = ({ data }) => {
      if (data.type === "progress") {
        this.onProgress?.(data.ratio as number);
        return;
      }
      const cb = this.pending.get(data.id as number);
      if (!cb) return;
      this.pending.delete(data.id as number);
      if (data.type === "error") cb[1](new Error(data.message as string));
      else cb[0](data);
    };
    this.w.onerror = (e) => {
      const err = new Error(e.message ?? "Worker error");
      for (const [, [, reject]] of this.pending) reject(err);
      this.pending.clear();
    };
  }

  private rpc(type: string, payload: unknown, transfer?: Transferable[]): Promise<Record<string, unknown>> {
    const id = this.seq++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, [resolve as (v: unknown) => void, reject]);
      this.w.postMessage({ id, type, payload }, (transfer ?? []) as StructuredSerializeOptions);
    });
  }

  init(baseUrl: string) { return this.rpc("init", { baseUrl }); }
  write(name: string, buffer: ArrayBuffer) { return this.rpc("write", { name, buffer }, [buffer]); }
  exec(args: string[], durationSec: number): Promise<{ ret: number }> {
    return this.rpc("exec", { args, durationSec }) as Promise<{ ret: number }>;
  }
  read(name: string): Promise<ArrayBuffer> {
    return this.rpc("read", { name }).then((d) => d["buffer"] as ArrayBuffer);
  }
  unlink(name: string) { return this.rpc("unlink", { name }); }
  terminate() { this.w.terminate(); }
}

// ── Format detection ──────────────────────────────────────────────────────────
const VIDEO_EXTS = new Set([
  "mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv", "wmv", "flv",
  "m4v", "3gp", "ts", "mts", "m2ts", "divx", "asf", "vob",
]);
const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4", webm: "video/webm", ogg: "video/ogg", ogv: "video/ogg",
  mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska",
  wmv: "video/x-ms-wmv", flv: "video/x-flv", m4v: "video/mp4",
  "3gp": "video/3gpp", ts: "video/mp2t",
};

function isVideoFile(f: File): boolean {
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  return f.type.startsWith("video/") || VIDEO_EXTS.has(ext);
}

function canBrowserPlay(f: File): boolean {
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  const mime = f.type || EXT_MIME[ext] || "";
  if (!mime) return false;
  const v = document.createElement("video");
  return v.canPlayType(mime) !== "";
}

// ── Audio tempo chain ─────────────────────────────────────────────────────────
// atempo filter only handles 0.5–2.0; chain two filters for values outside that
function buildAtempoChain(spd: number): string {
  if (spd >= 0.5 && spd <= 2.0) return `atempo=${spd}`;
  if (spd < 0.5)  return `atempo=0.5,atempo=${(spd / 0.5).toFixed(4)}`;
  return `atempo=2.0,atempo=${(spd / 2.0).toFixed(4)}`;
}

// ── Types & constants ─────────────────────────────────────────────────────────
type Quality    = "copy" | "high" | "medium" | "low";
type Rotate     = "none" | "90cw" | "90ccw" | "180" | "fliph" | "flipv";
type Resolution = "original" | "1080p" | "720p" | "480p" | "360p";

const QUALITIES:   Quality[]    = ["copy", "high", "medium", "low"];
const ROTATIONS:   Rotate[]     = ["none", "90cw", "90ccw", "180", "fliph", "flipv"];
const SPEEDS                    = [0.5, 0.75, 1, 1.25, 1.5, 2];
const RESOLUTIONS: Resolution[] = ["original", "1080p", "720p", "480p", "360p"];
const GIF_FPS                   = [8, 10, 15, 20, 24];

const QUALITY_CRF: Record<Exclude<Quality, "copy">, string> = {
  high: "23", medium: "28", low: "35",
};

const QUALITY_KEY: Record<Quality, "tools.vid_quality_copy" | "tools.vid_quality_high" | "tools.vid_quality_medium" | "tools.vid_quality_low"> = {
  copy:   "tools.vid_quality_copy",
  high:   "tools.vid_quality_high",
  medium: "tools.vid_quality_medium",
  low:    "tools.vid_quality_low",
};

const ROTATE_KEY: Record<Rotate, "tools.vid_rot_none" | "tools.vid_rot_90cw" | "tools.vid_rot_90ccw" | "tools.vid_rot_180" | "tools.vid_rot_fliph" | "tools.vid_rot_flipv"> = {
  none:   "tools.vid_rot_none",
  "90cw": "tools.vid_rot_90cw",
  "90ccw":"tools.vid_rot_90ccw",
  "180":  "tools.vid_rot_180",
  fliph:  "tools.vid_rot_fliph",
  flipv:  "tools.vid_rot_flipv",
};

// ── Component ─────────────────────────────────────────────────────────────────
interface VideoEditorProps {
  initialFile?: File;
  onAttach?: (file: File, thumbnail?: File) => void;
}

export function VideoEditor(props: VideoEditorProps = {}) {
  const { t } = useI18n();
  const s = (key: Parameters<typeof t>[0]) => String(t(key));

  let videoEl: HTMLVideoElement | undefined;
  let resultVideoEl: HTMLVideoElement | undefined;

  // Loading
  const [loadingFFmpeg, setLoadingFFmpeg] = createSignal(false);
  const [loadError,     setLoadError]     = createSignal<string | null>(null);

  // Source file
  const [file,      setFile]      = createSignal<File | null>(null);
  const [videoSrc,  setVideoSrc]  = createSignal<string | null>(null);
  const [duration,  setDuration]  = createSignal(0);
  const [noPreview, setNoPreview] = createSignal(false);

  // Edit params
  const [startTime,   setStartTime]   = createSignal(0);
  const [endTime,     setEndTime]     = createSignal(0);
  const [quality,     setQuality]     = createSignal<Quality>("high");
  const [rotate,      setRotate]      = createSignal<Rotate>("none");
  const [speed,       setSpeed]       = createSignal(1);
  const [resolution,  setResolution]  = createSignal<Resolution>("original");
  const [mute,        setMute]        = createSignal(false);
  const [audioOnly,   setAudioOnly]   = createSignal(false);
  const [gifMode,     setGifMode]     = createSignal(false);
  const [gifFps,      setGifFps]      = createSignal(10);

  // Processing
  const [processing,    setProcessing]    = createSignal(false);
  const [progress,      setProgress]      = createSignal(0);
  const [processError,  setProcessError]  = createSignal<string | null>(null);

  // Result
  const [resultBlob,    setResultBlob]    = createSignal<Blob | null>(null);
  const [resultUrl,     setResultUrl]     = createSignal<string | null>(null);
  const [resultIsAudio, setResultIsAudio] = createSignal(false);
  const [resultIsGif,   setResultIsGif]   = createSignal(false);

  // Thumbnail
  const [thumbnailFile, setThumbnailFile] = createSignal<File | null>(null);
  const [thumbnailUrl,  setThumbnailUrl]  = createSignal<string | null>(null);

  // Save to Files
  const [folders,       setFolders]       = createSignal<FileMeta[]>([]);
  const [foldersLoading,setFoldersLoading]= createSignal(false);
  const [saving,        setSaving]        = createSignal(false);
  const [saveProgress,  setSaveProgress]  = createSignal(0);
  const [savedPath,     setSavedPath]     = createSignal<string | null>(null);
  const [saveError,     setSaveError]     = createSignal<string | null>(null);
  const [saveFileName,  setSaveFileName]  = createSignal("");

  onCleanup(() => {
    const src = videoSrc(); if (src) URL.revokeObjectURL(src);
    const res = resultUrl(); if (res) URL.revokeObjectURL(res);
    const thumb = thumbnailUrl(); if (thumb) URL.revokeObjectURL(thumb);
  });

  onMount(() => {
    if (props.initialFile) openFile(props.initialFile);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const fmt = (secs: number) => {
    if (!isFinite(secs) || secs < 0) return "0:00";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const ss = Math.floor(secs % 60);
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
      : `${m}:${ss.toString().padStart(2, "0")}`;
  };

  const fmtBytes = (b: number) =>
    b < 1_048_576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1_048_576).toFixed(1)} MB`;

  // true when any video filter is active — makes stream-copy impossible
  const hasVideoFilter = () => rotate() !== "none" || speed() !== 1 || resolution() !== "original";

  // ── File open ────────────────────────────────────────────────────────────────
  const openFile = (f: File) => {
    if (!isVideoFile(f)) return;
    const prev = videoSrc(); if (prev) URL.revokeObjectURL(prev);
    const prevRes = resultUrl(); if (prevRes) URL.revokeObjectURL(prevRes);
    setFile(f);
    setVideoSrc(URL.createObjectURL(f));
    setNoPreview(!canBrowserPlay(f));
    setResultUrl(null);  setResultBlob(null);
    const prevThumb = thumbnailUrl(); if (prevThumb) URL.revokeObjectURL(prevThumb);
    setThumbnailUrl(null);  setThumbnailFile(null);
    setProcessError(null);
    setSavedPath(null);  setSaveError(null);
    setProgress(0);
    setDuration(0);  setStartTime(0);  setEndTime(0);
    setFolders([]);
    setRotate("none");  setSpeed(1);  setResolution("original");
    setMute(false);  setAudioOnly(false);  setGifMode(false);  setGifFps(10);
    setResultIsGif(false);
  };

  const onVideoMeta = (el: HTMLVideoElement) => {
    const dur = isFinite(el.duration) ? el.duration : 0;
    setDuration(dur);
    setEndTime(dur);
  };

  // ── Process video ────────────────────────────────────────────────────────────
  const processVideo = async () => {
    const f = file();
    if (!f || processing()) return;
    setProcessing(true);
    setProcessError(null);
    setProgress(0);
    setSavedPath(null);  setSaveError(null);
    const prevRes = resultUrl(); if (prevRes) URL.revokeObjectURL(prevRes);
    setResultUrl(null);  setResultBlob(null);
    const prevThumb = thumbnailUrl(); if (prevThumb) URL.revokeObjectURL(prevThumb);
    setThumbnailUrl(null);  setThumbnailFile(null);

    const worker = new FFmpegWorker(FFMPEG_BASE + "ffmpeg-worker.js");
    worker.onProgress = (ratio) => setProgress(Math.min(99, Math.round(ratio * 100)));

    try {
      setLoadingFFmpeg(true);
      setLoadError(null);
      await worker.init(FFMPEG_BASE);
      setLoadingFFmpeg(false);

      const ext        = (f.name.split(".").pop() ?? "mp4").toLowerCase();
      const inputName  = `input.${ext}`;
      const isGifOut   = gifMode();
      const isAudioOut = !isGifOut && audioOnly();
      const outputExt  = isGifOut ? "gif" : isAudioOut ? "mp3" : "mp4";
      const outputName = `output.${outputExt}`;

      await worker.write(inputName, await f.arrayBuffer());

      const dur   = duration();
      const start = startTime();
      const end   = endTime();
      const hasTrim = dur > 0 && (start > 0.05 || end < dur - 0.05);
      const q     = quality();
      const rot   = rotate();
      const spd   = speed();
      const res   = resolution();
      const muted = mute();

      // Estimate output duration for progress calculation
      const baseDur = hasTrim ? end - start : (dur || 0);
      const outputDuration = spd > 0 ? baseDur / spd : baseDur;

      if (isGifOut) {
        // Build shared vf chain: rotate → fps → scale
        const gifVf: string[] = [];
        if (rot === "90cw")       gifVf.push("transpose=1");
        else if (rot === "90ccw") gifVf.push("transpose=2");
        else if (rot === "180")   gifVf.push("vflip,hflip");
        else if (rot === "fliph") gifVf.push("hflip");
        else if (rot === "flipv") gifVf.push("vflip");
        gifVf.push(`fps=${gifFps()}`);
        if (res !== "original") {
          const h: Record<string, string> = { "1080p":"1080", "720p":"720", "480p":"480", "360p":"360" };
          gifVf.push(`scale=-2:${h[res]}:flags=lanczos`);
        }
        if (spd !== 1) gifVf.push(`setpts=${(1 / spd).toFixed(4)}*PTS`);
        const gifVfStr = gifVf.join(",");

        // Pass 1: generate palette (0-30%)
        const pass1: string[] = [];
        if (hasTrim) pass1.push("-ss", start.toFixed(3), "-to", end.toFixed(3));
        pass1.push("-i", inputName, "-vf", `${gifVfStr},palettegen=stats_mode=diff`, "palette.png");
        worker.onProgress = (ratio) => setProgress(Math.round(ratio * 30));
        const { ret: r1 } = await worker.exec(pass1, baseDur);
        if (r1 !== 0) throw new Error(`Palette generation failed (code ${r1})`);

        // Pass 2: encode GIF (30-100%)
        const pass2: string[] = [];
        if (hasTrim) pass2.push("-ss", start.toFixed(3), "-to", end.toFixed(3));
        pass2.push("-i", inputName, "-i", "palette.png");
        pass2.push("-filter_complex", `[0:v]${gifVfStr}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`);
        pass2.push("-map_metadata", "-1", outputName);
        worker.onProgress = (ratio) => setProgress(30 + Math.round(ratio * 69));
        const { ret: r2 } = await worker.exec(pass2, outputDuration);
        if (r2 !== 0) throw new Error(`GIF encoding failed (code ${r2})`);

        const gifBuf = await worker.read(outputName);
        await worker.unlink(inputName);
        await worker.unlink("palette.png");
        await worker.unlink(outputName);

        const gifBlob = new Blob([gifBuf], { type: "image/gif" });
        setResultBlob(gifBlob);
        setResultUrl(URL.createObjectURL(gifBlob));
        setResultIsAudio(false);
        setResultIsGif(true);
        setSaveFileName(`${f.name.replace(/\.[^.]+$/, "")}.gif`);
        setProgress(100);
      } else {
        const args: string[] = [];
        if (hasTrim) args.push("-ss", start.toFixed(3), "-to", end.toFixed(3));
        args.push("-i", inputName);

        if (isAudioOut) {
          // Audio-only: strip video, encode as MP3; apply speed if needed
          args.push("-vn", "-c:a", "libmp3lame", "-q:a", "2");
          if (spd !== 1) args.push("-af", buildAtempoChain(spd));
        } else {
          // Build video filter chain: rotate → scale → speed
          const vf: string[] = [];

          if (rot === "90cw")       vf.push("transpose=1");
          else if (rot === "90ccw") vf.push("transpose=2");
          else if (rot === "180")   vf.push("vflip,hflip");
          else if (rot === "fliph") vf.push("hflip");
          else if (rot === "flipv") vf.push("vflip");

          if (res !== "original") {
            const h: Record<string, string> = { "1080p":"1080", "720p":"720", "480p":"480", "360p":"360" };
            vf.push(`scale=-2:${h[res]}`);
          }

          if (spd !== 1) vf.push(`setpts=${(1 / spd).toFixed(4)}*PTS`);

          const needsTranscode = vf.length > 0 || q !== "copy";
          if (vf.length > 0) args.push("-vf", vf.join(","));

          if (needsTranscode) {
            // Use "high" CRF if user had "copy" selected but filters forced a re-encode
            const crf = q === "copy" ? QUALITY_CRF["high"] : QUALITY_CRF[q as Exclude<Quality, "copy">];
            args.push("-c:v", "libx264", "-crf", crf, "-preset", "fast");
          } else {
            args.push("-c:v", "copy");
          }

          if (muted) {
            args.push("-an");
          } else if (spd !== 1) {
            args.push("-c:a", "aac", "-b:a", "128k", "-af", buildAtempoChain(spd));
          } else if (needsTranscode) {
            args.push("-c:a", "aac", "-b:a", "128k");
          } else {
            args.push("-c:a", "copy");
          }

          args.push("-movflags", "+faststart");
        }

        // Strip all metadata (GPS, device make/model, serial number, timestamps)
        args.push("-map_metadata", "-1");
        args.push(outputName);

        const { ret } = await worker.exec(args, outputDuration);
        if (ret !== 0) throw new Error(`FFmpeg exited with code ${ret}`);

        const outputBuf = await worker.read(outputName);
        await worker.unlink(inputName);
        await worker.unlink(outputName);

        const mime = isAudioOut ? "audio/mpeg" : "video/mp4";
        const blob = new Blob([outputBuf], { type: mime });
        setResultBlob(blob);
        setResultUrl(URL.createObjectURL(blob));
        setResultIsAudio(isAudioOut);
        setResultIsGif(false);
        setSaveFileName(`${f.name.replace(/\.[^.]+$/, "")}-edited.${outputExt}`);
        setProgress(100);
      }

      // Pre-fetch folders in background
      const nick = currentNick();
      if (nick && !folders().length) {
        setFoldersLoading(true);
        listFolder(nick, "")
          .then((items) => setFolders(items.filter((i) => i.is_dir)))
          .catch(() => {})
          .finally(() => setFoldersLoading(false));
      }
    } catch (err) {
      setLoadingFFmpeg(false);
      setProcessError(err instanceof Error ? err.message : s("tools.vid_error"));
    } finally {
      worker.terminate();
      setProcessing(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────────
  const download = () => {
    const blob = resultBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = file()?.name.replace(/\.[^.]+$/, "") ?? "video";
    const ext = resultIsGif() ? "gif" : resultIsAudio() ? "mp3" : "mp4";
    a.download = resultIsGif() ? `${base}.gif` : `${base}-edited.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Save to cloud files ───────────────────────────────────────────────────────
  const saveToFolder = async (folderDisplayPath: string) => {
    const blob = resultBlob();
    const nick = currentNick();
    if (!blob || !nick || saving()) return;
    setSaving(true);  setSaveError(null);  setSaveProgress(0);
    try {
      const name = saveFileName().trim() || `video-edited.${resultIsAudio() ? "mp3" : "mp4"}`;
      const outFile = new File([blob], name, { type: blob.type });
      await uploadFile(davDirPath(nick, folderDisplayPath), outFile, setSaveProgress);
      setSavedPath(folderDisplayPath || "/");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : s("tools.vid_save_error"));
    } finally {
      setSaving(false);
    }
  };

  // ── Thumbnail capture ─────────────────────────────────────────────────────────
  const captureThumbnail = async () => {
    if (!resultVideoEl) return;
    const base = file()?.name.replace(/\.[^.]+$/, "") ?? "video";
    const thumbFile = await grabFrame(resultVideoEl, `${base}-thumbnail.jpg`);
    if (!thumbFile) return;
    const prev = thumbnailUrl(); if (prev) URL.revokeObjectURL(prev);
    setThumbnailFile(thumbFile);
    setThumbnailUrl(URL.createObjectURL(thumbFile));
  };

  // ── CSS shortcuts ─────────────────────────────────────────────────────────────
  const btnPrimary = "px-4 py-1.5 rounded-lg text-sm font-medium bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity";
  const btnOutline = "px-4 py-1.5 rounded-lg text-sm font-medium border border-rim text-muted hover:bg-elevated hover:text-txt transition-colors disabled:opacity-50";
  const chip       = "px-3 py-1.5 text-xs rounded-lg border transition-colors";
  const chipOn     = "bg-accent text-accent-fg border-accent";
  const chipOff    = "border-rim text-muted hover:bg-elevated hover:text-txt";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div class="flex flex-col gap-5 max-w-3xl w-full mx-auto">
      <Show
        when={file()}
        fallback={
          <label
            class="flex flex-col items-center justify-center gap-3 h-48 rounded-xl border-2 border-dashed border-rim text-muted cursor-pointer hover:border-rim-strong hover:text-txt transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) openFile(f); }}
          >
            <MdOutlineMovie class="text-4xl text-muted" aria-hidden="true" />
            <span class="text-sm">{s("tools.vid_drop")}</span>
            <input
              type="file"
              accept="video/*,.avi,.mkv,.wmv,.flv,.m4v,.ts,.mts"
              class="sr-only"
              onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) openFile(f); e.currentTarget.value = ""; }}
            />
          </label>
        }
      >
        {(f) => (
          <>
            {/* Preview */}
            <Show
              when={!noPreview()}
              fallback={
                <div class="rounded-xl bg-elevated flex items-center justify-center h-28 text-sm text-muted text-center px-6">
                  {s("tools.vid_no_preview")}
                </div>
              }
            >
              <div class="rounded-xl overflow-hidden bg-elevated">
                <video
                  ref={(el) => { videoEl = el; }}
                  src={videoSrc()!}
                  controls
                  class="w-full max-h-64"
                  onLoadedMetadata={(e) => onVideoMeta(e.currentTarget)}
                />
              </div>
            </Show>

            {/* File info */}
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span class="truncate max-w-xs">{f().name}</span>
              <span>{fmtBytes(f().size)}</span>
              <Show when={duration() > 0}>
                <span>{s("tools.vid_duration")}: {fmt(duration())}</span>
              </Show>
            </div>

            {/* ── Trim ── */}
            <Show when={duration() > 0}>
              <div class="border border-rim rounded-xl p-4 flex flex-col gap-4">
                <h3 class="text-sm font-medium text-txt">{s("tools.vid_trim")}</h3>
                <div class="flex flex-col gap-3">
                  <div class="flex items-center gap-3">
                    <span class="text-xs text-muted w-10 shrink-0">{s("tools.vid_start")}</span>
                    <input type="range" min="0" max={duration()} step="0.1" value={startTime()}
                      onInput={(e) => { const v = Math.min(parseFloat(e.currentTarget.value), endTime() - 0.5); setStartTime(v); if (videoEl) videoEl.currentTime = v; }}
                      class="flex-1" />
                    <span class="text-xs text-txt font-mono w-12 text-right shrink-0">{fmt(startTime())}</span>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="text-xs text-muted w-10 shrink-0">{s("tools.vid_end")}</span>
                    <input type="range" min="0" max={duration()} step="0.1" value={endTime()}
                      onInput={(e) => { const v = Math.max(parseFloat(e.currentTarget.value), startTime() + 0.5); setEndTime(v); if (videoEl) videoEl.currentTime = v; }}
                      class="flex-1" />
                    <span class="text-xs text-txt font-mono w-12 text-right shrink-0">{fmt(endTime())}</span>
                  </div>
                  <p class="text-xs text-muted">{fmt(endTime() - startTime())} / {fmt(duration())}</p>
                </div>
              </div>
            </Show>

            {/* ── Quality ── */}
            <div class="border border-rim rounded-xl p-4 flex flex-col gap-3">
              <h3 class="text-sm font-medium text-txt">{s("tools.vid_quality")}</h3>
              <div class="flex flex-wrap gap-2">
                <For each={QUALITIES}>
                  {(q) => {
                    const copyDisabled = q === "copy" && hasVideoFilter();
                    return (
                      <button
                        onClick={() => { if (!copyDisabled) setQuality(q); }}
                        disabled={copyDisabled}
                        class={`${chip} ${quality() === q && !copyDisabled ? chipOn : chipOff} disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {s(QUALITY_KEY[q])}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* ── Transform ── */}
            <div class="border border-rim rounded-xl p-4 flex flex-col gap-4">
              <h3 class="text-sm font-medium text-txt">{s("tools.vid_transform")}</h3>

              <div class="flex flex-col gap-2">
                <span class="text-xs text-muted">{s("tools.vid_rotate")}</span>
                <div class="flex flex-wrap gap-2">
                  <For each={ROTATIONS}>
                    {(rot) => (
                      <button onClick={() => setRotate(rot)} class={`${chip} ${rotate() === rot ? chipOn : chipOff}`}>
                        {s(ROTATE_KEY[rot])}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="flex flex-col gap-2">
                <span class="text-xs text-muted">{s("tools.vid_speed")}</span>
                <div class="flex flex-wrap gap-2">
                  <For each={SPEEDS}>
                    {(spd) => (
                      <button onClick={() => setSpeed(spd)} class={`${chip} ${speed() === spd ? chipOn : chipOff}`}>
                        {spd}×
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </div>

            {/* ── Output options ── */}
            <div class="border border-rim rounded-xl p-4 flex flex-col gap-4">
              <h3 class="text-sm font-medium text-txt">{s("tools.vid_output")}</h3>

              <div class="flex flex-col gap-2">
                <span class="text-xs text-muted">{s("tools.vid_resize")}</span>
                <div class="flex flex-wrap gap-2">
                  <For each={RESOLUTIONS}>
                    {(res) => (
                      <button onClick={() => setResolution(res)} class={`${chip} ${resolution() === res ? chipOn : chipOff}`}>
                        {res === "original" ? s("tools.vid_res_original") : res}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="flex flex-wrap gap-5">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={mute()} onChange={(e) => setMute(e.currentTarget.checked)} class="rounded" disabled={gifMode()} />
                  <span class="text-sm text-txt">{s("tools.vid_mute")}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={audioOnly()} onChange={(e) => { setAudioOnly(e.currentTarget.checked); if (e.currentTarget.checked) setGifMode(false); }} class="rounded" />
                  <span class="text-sm text-txt">{s("tools.vid_audio_only")}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={gifMode()} onChange={(e) => { setGifMode(e.currentTarget.checked); if (e.currentTarget.checked) { setAudioOnly(false); setMute(false); } }} class="rounded" />
                  <span class="text-sm text-txt">{s("tools.vid_gif_mode")}</span>
                </label>
              </div>
              <Show when={gifMode()}>
                <div class="flex flex-col gap-2">
                  <span class="text-xs text-muted">{s("tools.vid_gif_fps")}</span>
                  <div class="flex flex-wrap gap-2">
                    <For each={GIF_FPS}>
                      {(fps) => (
                        <button onClick={() => setGifFps(fps)} class={`${chip} ${gifFps() === fps ? chipOn : chipOff}`}>
                          {fps} fps
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </div>

            {/* Loading / error */}
            <Show when={loadingFFmpeg()}>
              <p class="text-sm text-muted text-center animate-pulse">{s("tools.vid_loading_ffmpeg")}</p>
            </Show>
            <Show when={loadError()}>
              <p class="text-sm text-red-500">{loadError()}</p>
            </Show>

            {/* Progress bar */}
            <Show when={processing()}>
              <div class="flex flex-col gap-2">
                <div class="w-full bg-elevated rounded-full h-2 overflow-hidden">
                  <div class="bg-accent h-2 rounded-full transition-all duration-300" style={{ width: `${progress()}%` }} />
                </div>
                <p class="text-xs text-muted text-center">{s("tools.vid_processing")} — {progress()}%</p>
              </div>
            </Show>

            <Show when={processError()}>
              <p class="text-sm text-red-500 px-1">{processError()}</p>
            </Show>

            {/* Action buttons */}
            <div class="flex gap-3 flex-wrap">
              <button onClick={processVideo} disabled={processing() || loadingFFmpeg()} class={btnPrimary}>
                {processing() ? s("tools.vid_processing") : s("tools.vid_process")}
              </button>
              <label class={`${btnOutline} cursor-pointer`}>
                {s("tools.vid_edit_another")}
                <input type="file" accept="video/*,.avi,.mkv,.wmv,.flv,.m4v,.ts,.mts" class="sr-only"
                  onChange={(e) => { const nf = e.currentTarget.files?.[0]; if (nf) openFile(nf); e.currentTarget.value = ""; }} />
              </label>
            </div>

            {/* Result */}
            <Show when={resultUrl()}>
              {(url) => (
                <div class="border border-rim rounded-xl overflow-hidden flex flex-col">
                  <div class="px-4 py-3 border-b border-rim bg-elevated">
                    <h3 class="text-sm font-medium text-txt">{s("tools.vid_result")}</h3>
                  </div>
                  <div class="p-4 flex flex-col gap-4">
                    <Show
                      when={!resultIsAudio()}
                      fallback={<audio src={url()} controls class="w-full" />}
                    >
                      <Show
                        when={resultIsGif()}
                        fallback={<video ref={(el) => { resultVideoEl = el; }} src={url()} controls class="w-full rounded-lg" />}
                      >
                        <img src={url()} alt="GIF" class="w-full rounded-lg" />
                      </Show>
                    </Show>
                    {/* Thumbnail picker — video only, not for GIF, and only when
                        attaching (the standalone tool has nowhere to put it). */}
                    <Show when={props.onAttach && !resultIsAudio() && !resultIsGif()}>
                      <div class="border border-rim rounded-xl overflow-hidden">
                        <div class="px-4 py-2.5 border-b border-rim bg-elevated flex items-center justify-between">
                          <span class="text-xs font-medium text-txt">{s("tools.vid_thumbnail")}</span>
                          <button onClick={captureThumbnail} class={btnOutline} style="padding:0.25rem 0.75rem;font-size:0.75rem">
                            {thumbnailUrl() ? s("tools.vid_thumbnail_recapture") : s("tools.vid_thumbnail_capture")}
                          </button>
                        </div>
                        <Show
                          when={thumbnailUrl()}
                          fallback={
                            <p class="px-4 py-3 text-xs text-muted">{s("tools.vid_thumbnail_hint")}</p>
                          }
                        >
                          {(url) => (
                            <div class="p-3 flex items-center gap-3">
                              <img src={url()} alt="thumbnail" class="h-16 rounded-lg object-cover shrink-0" />
                              <p class="text-xs text-muted">{s("tools.vid_thumbnail_set")}</p>
                            </div>
                          )}
                        </Show>
                      </div>
                    </Show>

                    <div class="flex items-center justify-between flex-wrap gap-3">
                      <span class="text-xs text-muted">{s("tools.vid_result_size")}: {fmtBytes(resultBlob()!.size)}</span>
                      <div class="flex gap-2 flex-wrap">
                        <Show when={props.onAttach}>
                          <button
                            onClick={() => {
                              const blob = resultBlob();
                              if (!blob || !props.onAttach) return;
                              const ext = resultIsAudio() ? "mp3" : "mp4";
                              props.onAttach(
                                new File([blob], saveFileName() || `video-edited.${ext}`, { type: blob.type }),
                                thumbnailFile() ?? undefined,
                              );
                            }}
                            class={btnPrimary}
                          >
                            {s("editor.cam_attach")}
                          </button>
                        </Show>
                        <button onClick={download} class={props.onAttach ? btnOutline : btnPrimary}>
                          {resultIsGif() ? s("tools.vid_download_gif") : resultIsAudio() ? s("tools.vid_download_mp3") : s("tools.vid_download")}
                        </button>
                      </div>
                    </div>

                    {/* Save to cloud files */}
                    <Show when={currentNick()}>
                      <Show
                        when={!savedPath()}
                        fallback={
                          <div class="flex items-center gap-2 text-sm text-txt border border-rim rounded-xl px-4 py-3">
                            <MdFillCheck class="text-green-500 shrink-0" />
                            <span>{s("tools.vid_saved")} <strong>{savedPath()}</strong></span>
                          </div>
                        }
                      >
                        <div class="border border-rim rounded-xl overflow-hidden">
                          <div class="px-4 py-3 border-b border-rim bg-elevated">
                            <h3 class="text-sm font-medium text-txt">{s("tools.vid_save_to_files")}</h3>
                          </div>
                          <div class="px-4 py-3 border-b border-rim">
                            <label class="flex flex-col gap-1.5">
                              <span class="text-xs text-muted">{s("tools.vid_filename")}</span>
                              <input
                                type="text"
                                value={saveFileName()}
                                onInput={(e) => setSaveFileName(e.currentTarget.value)}
                                class="w-full px-3 py-1.5 text-sm rounded-lg border border-rim bg-base text-txt focus:outline-none focus:border-accent"
                              />
                            </label>
                          </div>
                          <div class="max-h-48 overflow-y-auto">
                            <Show when={!foldersLoading()}
                              fallback={<p class="text-sm text-muted text-center py-4">{s("tools.vid_loading")}</p>}
                            >
                              <button onClick={() => saveToFolder("")} disabled={saving()}
                                class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-elevated transition-colors text-left disabled:opacity-50 border-b border-rim">
                                <MdFillFolder class="text-lg shrink-0 text-muted" />
                                <span class="flex-1 text-sm text-txt">/</span>
                              </button>
                              <For each={folders()}>
                                {(folder) => (
                                  <button onClick={() => saveToFolder(folder.display_path)} disabled={saving()}
                                    class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-elevated transition-colors text-left disabled:opacity-50 border-b border-rim last:border-0">
                                    <MdFillFolder class="text-lg shrink-0 text-muted" />
                                    <span class="flex-1 text-sm text-txt truncate">{folder.display_path}</span>
                                  </button>
                                )}
                              </For>
                            </Show>
                          </div>
                          <Show when={saving()}>
                            <div class="px-4 py-2 border-t border-rim">
                              <div class="w-full bg-elevated rounded-full h-1.5 overflow-hidden">
                                <div class="bg-accent h-1.5 rounded-full transition-all" style={{ width: `${saveProgress()}%` }} />
                              </div>
                            </div>
                          </Show>
                          <Show when={saveError()}>
                            <p class="text-xs text-red-500 px-4 pb-3">{saveError()}</p>
                          </Show>
                        </div>
                      </Show>
                    </Show>
                  </div>
                </div>
              )}
            </Show>

            <p class="text-xs text-muted text-center italic">{s("tools.vid_note")}</p>
          </>
        )}
      </Show>
    </div>
  );
}
