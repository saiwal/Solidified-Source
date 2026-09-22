import {
  createSignal,
  onCleanup,
  Show,
  type Component,
} from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import SharedImageEditor from "@/shared/views/ImageEditor";
import { VideoEditor } from "@/modules/tools/components/VideoEditor";
import { MdOutlineChevron_left, MdOutlineClose, MdOutlineRefresh, MdOutlineVideocam } from "solid-icons/md";

import Modal from "@/shared/views/Modal";
type Mode  = "photo" | "video" | "audio";
type Stage = "initializing" | "streaming" | "captured" | "editing" | "editing-video" | "error";

interface Props {
  onClose: () => void;
  onCapture: (files: File[], thumbnail?: File) => void;
}

const CameraCapture: Component<Props> = (props) => {
  const { t } = useI18n();

  const [mode,        setMode]        = createSignal<Mode>("photo");
  const [stage,       setStage]       = createSignal<Stage>("initializing");
  const [errorMsg,    setErrorMsg]    = createSignal("");
  const [recording,   setRecording]   = createSignal(false);
  const [capturedUrl, setCapturedUrl] = createSignal<string | null>(null);
  const [capturedFile,setCapturedFile]= createSignal<File | null>(null);
  const [editFile,    setEditFile]    = createSignal<File | null>(null);
  const [facing,      setFacing]      = createSignal<"environment" | "user">("environment");
  const [torchOn,     setTorchOn]     = createSignal(false);
  const [hasTorch,    setHasTorch]    = createSignal(false);

  let videoRef: HTMLVideoElement | undefined;
  let nativeInputRef: HTMLInputElement | undefined;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];

  // ── Camera / mic lifecycle ───────────────────────────────────────────────────

  async function startCamera(m: Mode) {
    const wasStreaming = stream !== null;
    stopCamera();
    setStage("initializing");
    setErrorMsg("");
    // Android needs longer to release camera hardware after a previous stream;
    // without this the next getUserMedia races the teardown and gets NotReadableError.
    await new Promise<void>((resolve) => setTimeout(resolve, wasStreaming ? 500 : 150));
    try {
      if (m === "audio") {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing() },
          audio: m === "video",
        });
        if (videoRef) {
          videoRef.srcObject = stream;
          // play() is non-fatal: iOS Safari rejects it after an async break
          // but autoplay+muted+playsinline handles playback on its own
          videoRef.play().catch(() => {});
        }
        const videoTrack = stream.getVideoTracks()[0];
        // Camera hardware may not have populated capabilities yet; brief delay avoids
        // getCapabilities() returning an empty object and torch going undetected.
        await new Promise<void>((resolve) => setTimeout(resolve, 200));
        const caps = videoTrack?.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        setHasTorch(!!caps?.torch);
      }
      setStage("streaming");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(t("editor.cam_error_access")));
      setStage("error");
    }
  }

  function stopCamera() {
    recorder?.stop();
    recorder = null;
    chunks = [];
    stream?.getTracks().forEach((tr) => tr.stop());
    stream = null;
    if (videoRef) videoRef.srcObject = null;
    setTorchOn(false);
    setHasTorch(false);
  }

  function revokeCaptured() {
    const url = capturedUrl();
    if (url) URL.revokeObjectURL(url);
    setCapturedUrl(null);
    setCapturedFile(null);
  }

  onCleanup(() => {
    stopCamera();
    revokeCaptured();
  });

  // Start camera on mount
  startCamera(mode());

  // ── Switch mode ──────────────────────────────────────────────────────────────

  function switchMode(m: Mode) {
    if (m === mode()) return;
    revokeCaptured();
    setMode(m);
    startCamera(m);
  }

  function switchFacing() {
    const next = facing() === "environment" ? "user" : "environment";
    setFacing(next);
    startCamera(mode());
  }

  async function toggleTorch() {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    const next = !torchOn();
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // torch toggle failed silently — hardware may not support it at runtime
    }
  }

  // ── Photo capture ────────────────────────────────────────────────────────────

  function capturePhoto() {
    if (!videoRef) return;
    const canvas = document.createElement("canvas");
    canvas.width  = videoRef.videoWidth  || 640;
    canvas.height = videoRef.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCamera();
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      setCapturedFile(file);
      setCapturedUrl(URL.createObjectURL(blob));
      setStage("captured");
    }, "image/jpeg", 0.92);
  }

  // ── Recording (video + audio) ────────────────────────────────────────────────

  function startRecording() {
    if (!stream) return;
    chunks = [];

    let mime: string;
    if (mode() === "audio") {
      mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")  ? "audio/ogg;codecs=opus"  :
        "audio/webm";
    } else {
      mime = "video/webm";
      for (const m of ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
        if (MediaRecorder.isTypeSupported(m)) { mime = m; break; }
      }
    }

    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      recorder = new MediaRecorder(stream);
      mime = recorder.mimeType || (mode() === "audio" ? "audio/webm" : "video/webm");
    }

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop  = () => finishRecording(mime);
    recorder.onerror = () => { if (chunks.length > 0) finishRecording(mime); else startCamera(mode()); };
    recorder.start(100);
    setRecording(true);
  }

  function stopRecording() {
    recorder?.stop();
    setRecording(false);
  }

  function finishRecording(mime: string) {
    const blob = new Blob(chunks, { type: mime });
    const isAudio = mode() === "audio" || mime.startsWith("audio/");
    const ext = isAudio
      ? (mime.includes("ogg") ? "ogg" : "webm")
      : (mime.includes("webm") ? "webm" : "mp4");
    const prefix = isAudio ? "audio" : "video";
    const file = new File([blob], `${prefix}-${Date.now()}.${ext}`, { type: mime });
    stopCamera();
    setCapturedFile(file);
    setCapturedUrl(URL.createObjectURL(blob));
    setStage("captured");
  }

  // ── Post-capture actions ─────────────────────────────────────────────────────

  function retake() {
    revokeCaptured();
    startCamera(mode());
  }

  function attach() {
    const file = capturedFile();
    if (file) props.onCapture([file]);
    props.onClose();
  }

  function openEditor() {
    const file = capturedFile();
    if (!file) return;
    setEditFile(file);
    setStage("editing");
  }

  function openVideoEditor() {
    setStage("editing-video");
  }

  function onEditConfirm(blob: Blob) {
    const editedFile = new File([blob], `photo-edited-${Date.now()}.jpg`, { type: "image/jpeg" });
    props.onCapture([editedFile]);
    props.onClose();
  }

  function onEditCancel() {
    setEditFile(null);
    setStage("captured");
  }

  function onVideoAttach(file: File, thumbnail?: File) {
    props.onCapture([file], thumbnail);
    props.onClose();
  }

  // ── Shared classes ───────────────────────────────────────────────────────────

  const btnPrimary = "px-4 py-2 rounded-xl text-sm font-medium bg-accent text-accent-fg hover:opacity-90 transition-opacity disabled:opacity-50";
  const btnOutline = "px-4 py-2 rounded-xl text-sm font-medium border border-rim text-muted hover:bg-elevated hover:text-txt transition-colors";

  return (
    <>
      {/* Full-screen image editor */}
      <Show when={stage() === "editing" && editFile()}>
        <SharedImageEditor
          file={editFile()!}
          onConfirm={onEditConfirm}
          onCancel={onEditCancel}
        />
      </Show>

      {/* Full-screen video editor */}
      <Show when={stage() === "editing-video" && capturedFile()}>
        <Modal onClose={() => setStage("captured")} bare label={String(t("editor.cam_edit"))}
               class="fixed inset-0 w-full h-full z-[1000] flex flex-col bg-surface overflow-y-auto">
            <div class="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-rim bg-surface">
              <button
                type="button"
                onClick={() => setStage("captured")}
                class="flex items-center gap-1.5 text-sm text-muted hover:text-txt transition-colors"
              >
                <MdOutlineChevron_left class="w-4 h-4" />
                Back
              </button>
              <span class="text-sm font-semibold text-txt">{String(t("editor.cam_edit"))}</span>
            </div>
            <div class="p-4">
              <VideoEditor
                initialFile={capturedFile()!}
                onAttach={onVideoAttach}
              />
            </div>
        </Modal>
      </Show>

      <Show when={stage() !== "editing" && stage() !== "editing-video"}>
        {/* the centering wrapper is folded into the dialog itself, so a click
            landing on it is a backdrop click the <Modal> can see */}
        <Modal onClose={props.onClose} bare labelledBy="camera-title"
               class="fixed inset-0 w-full h-full z-[1000] overflow-y-auto bg-black/80 backdrop-blur-sm
                      flex min-h-full items-center justify-center p-4">
            <div class="relative bg-surface border border-rim rounded-2xl shadow-2xl flex flex-col w-full max-w-md overflow-hidden">

              {/* Header */}
              <div class="flex items-center justify-between px-4 py-3 border-b border-rim">
                <h2 id="camera-title" class="text-sm font-semibold text-txt">{String(t("editor.cam_title"))}</h2>
                <button
                  type="button"
                  onClick={props.onClose}
                  aria-label={String(t("editor.cancel_btn"))}
                  class="p-1 rounded-lg text-muted hover:text-txt hover:bg-elevated transition-colors"
                >
                  <MdOutlineClose class="w-4 h-4" />
                </button>
              </div>

              {/* Mode switcher */}
              <Show when={stage() !== "captured"}>
                <div class="flex border-b border-rim">
                  {(["photo", "video", "audio"] as Mode[]).map((m) => (
                    <button
                      type="button"
                      onClick={() => switchMode(m)}
                      class={
                        "flex-1 py-2.5 text-xs font-medium transition-colors " +
                        (mode() === m
                          ? "text-accent border-b-2 border-accent bg-accent/5"
                          : "text-muted hover:text-txt hover:bg-elevated")
                      }
                    >
                      {m === "photo"
                        ? String(t("editor.cam_photo"))
                        : m === "video"
                          ? String(t("editor.cam_video"))
                          : String(t("editor.cam_audio"))}
                    </button>
                  ))}
                </div>
              </Show>

              {/* Camera view / audio UI / preview */}
              <div class="relative bg-black aspect-[4/3] w-full flex items-center justify-center">

                {/* Live video (hidden in audio mode or when captured) */}
                <video
                  ref={videoRef}
                  autoplay
                  playsinline
                  muted
                  class={
                    "w-full h-full object-contain " +
                    (stage() === "captured" || mode() === "audio" ? "hidden" : "")
                  }
                />

                {/* Audio mode: mic UI (streaming state) */}
                <Show when={mode() === "audio" && stage() === "streaming"}>
                  <div class="absolute inset-0 flex flex-col items-center justify-center gap-5">
                    <div class="relative flex items-center justify-center">
                      <Show when={recording()}>
                        <div class="absolute w-24 h-24 rounded-full bg-red-500/20 animate-ping" />
                      </Show>
                      <div class={
                        "w-20 h-20 rounded-full flex items-center justify-center transition-colors " +
                        (recording() ? "bg-red-500/30" : "bg-white/10")
                      }>
                        <svg class="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                      </div>
                    </div>
                    <Show when={!recording()}>
                      <p class="text-sm text-white/50">{String(t("editor.cam_audio_ready"))}</p>
                    </Show>
                  </div>
                </Show>

                {/* Captured photo preview */}
                <Show when={stage() === "captured" && capturedUrl() && mode() === "photo"}>
                  <img
                    src={capturedUrl()!}
                    alt="Captured photo"
                    class="w-full h-full object-contain"
                  />
                </Show>

                {/* Captured video preview */}
                <Show when={stage() === "captured" && capturedUrl() && mode() === "video"}>
                  <video
                    src={capturedUrl()!}
                    controls
                    class="w-full h-full object-contain"
                  />
                </Show>

                {/* Captured audio preview */}
                <Show when={stage() === "captured" && capturedUrl() && mode() === "audio"}>
                  <div class="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
                    <svg class="w-12 h-12 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                    </svg>
                    <audio src={capturedUrl()!} controls class="w-full" />
                  </div>
                </Show>

                {/* Initializing overlay */}
                <Show when={stage() === "initializing"}>
                  <div class="absolute inset-0 flex items-center justify-center bg-black/60">
                    <p class="text-sm text-white/80 animate-pulse">{String(t("editor.cam_starting"))}</p>
                  </div>
                </Show>

                {/* Error overlay */}
                <Show when={stage() === "error"}>
                  <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                    <MdOutlineVideocam class="w-10 h-10 text-red-400" />
                    <p class="text-sm text-white/80">{String(t("editor.cam_error_access"))}</p>
                    <Show when={errorMsg()}>
                      <p class="text-xs text-white/50">{errorMsg()}</p>
                    </Show>
                    <button
                      type="button"
                      onClick={() => startCamera(mode())}
                      class="mt-1 px-4 py-1.5 bg-accent text-accent-fg text-sm rounded-lg hover:opacity-90 transition-opacity"
                    >
                      {String(t("editor.cam_retry"))}
                    </button>
                  </div>
                </Show>

                {/* Recording indicator */}
                <Show when={recording() && mode() !== "audio"}>
                  <div class="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-0.5">
                    <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span class="text-xs text-white font-medium">{String(t("editor.cam_recording"))}</span>
                  </div>
                </Show>

                {/* Torch button */}
                <Show when={stage() === "streaming" && mode() !== "audio" && hasTorch() && !recording()}>
                  <button
                    type="button"
                    onClick={toggleTorch}
                    aria-label={String(t("editor.cam_torch"))}
                    class={
                      "absolute top-3 left-3 p-2 rounded-full transition-colors " +
                      (torchOn()
                        ? "bg-yellow-400/90 text-black"
                        : "bg-black/60 text-white hover:bg-black/80")
                    }
                  >
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M7 2v11h3v9l7-12h-4l4-8z" />
                    </svg>
                  </button>
                </Show>

                {/* Flip camera button */}
                <Show when={stage() === "streaming" && mode() !== "audio"}>
                  <button
                    type="button"
                    onClick={switchFacing}
                    aria-label={String(t("editor.cam_flip"))}
                    class="absolute top-3 right-3 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <MdOutlineRefresh class="w-5 h-5" />
                  </button>
                </Show>
              </div>

              {/* Shared native camera input */}
              <input
                ref={nativeInputRef}
                type="file"
                accept={mode() === "audio" ? "audio/*" : mode() === "video" ? "video/*" : "image/*"}
                capture="environment"
                class="hidden"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  if (file) props.onCapture([file]);
                  props.onClose();
                }}
              />

              {/* Controls */}
              <div class="px-4 py-4">

                {/* Error controls */}
                <Show when={stage() === "error"}>
                  <div class="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => nativeInputRef?.click()}
                      class={btnOutline}
                    >
                      {String(t("editor.cam_use_native"))}
                    </button>
                  </div>
                </Show>

                {/* Streaming controls */}
                <Show when={stage() === "streaming"}>
                  <div class="flex items-center justify-center gap-3">
                    <Show
                      when={mode() === "photo"}
                      fallback={
                        <Show
                          when={!recording()}
                          fallback={
                            <button type="button" onClick={stopRecording} class={btnPrimary}>
                              {String(t("editor.cam_stop"))}
                            </button>
                          }
                        >
                          <button type="button" onClick={startRecording} class={btnPrimary}>
                            {String(t("editor.cam_record"))}
                          </button>
                        </Show>
                      }
                    >
                      <button type="button" onClick={capturePhoto} class={btnPrimary}>
                        {String(t("editor.cam_capture"))}
                      </button>
                    </Show>
                    <button
                      type="button"
                      onClick={() => nativeInputRef?.click()}
                      aria-label={String(t("editor.cam_use_native"))}
                      title={String(t("editor.cam_use_native"))}
                      class="p-2 rounded-xl border border-rim text-muted hover:bg-elevated hover:text-txt transition-colors"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" stroke-width="2"/>
                        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>
                      </svg>
                    </button>
                    <button type="button" onClick={props.onClose} class={btnOutline}>
                      {String(t("editor.cancel_btn"))}
                    </button>
                  </div>
                </Show>

                {/* Captured controls */}
                <Show when={stage() === "captured"}>
                  <div class="flex flex-wrap items-center justify-center gap-2">
                    <button type="button" onClick={attach} class={btnPrimary}>
                      {String(t("editor.cam_attach"))}
                    </button>
                    <Show when={mode() !== "audio"}>
                      <button
                        type="button"
                        onClick={() => mode() === "photo" ? openEditor() : openVideoEditor()}
                        class={btnOutline}
                      >
                        {String(t("editor.cam_edit"))}
                      </button>
                    </Show>
                    <button type="button" onClick={retake} class={btnOutline}>
                      {String(t("editor.cam_retake"))}
                    </button>
                  </div>
                </Show>

              </div>

            </div>
      </Modal>
      </Show>
    </>
  );
};

export default CameraCapture;
