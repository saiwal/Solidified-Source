/**
 * Video poster frames, drawn client-side — no ffmpeg, just <video> + canvas.
 *
 * Capped at 1280px on the long side: a poster is shown at player size, and a
 * full-resolution frame off a 4K phone clip is a multi-MB JPEG uploaded for
 * nothing.
 */

/** The video's current frame as a JPEG, or null if no frame is decoded yet. */
export function grabFrame(video: HTMLVideoElement, name = "poster.jpg", maxSide = 1280): Promise<File | null> {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ? new File([b], name, { type: "image/jpeg" }) : null), "image/jpeg", 0.85),
  );
}

/**
 * A poster for a freshly picked video file: the frame at 1s (or a quarter in,
 * for clips shorter than 4s). Resolves null when the browser can't decode the
 * file (.mkv/.avi and friends) or takes longer than 5s — a poster is optional.
 */
export function autoPoster(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  const base = file.name.replace(/\.[^.]+$/, "") || "video";

  return new Promise<File | null>((resolve) => {
    const done = (f: File | null) => { clearTimeout(timer); resolve(f); };
    const timer = setTimeout(() => done(null), 5000);
    v.onerror = () => done(null);
    v.onloadedmetadata = () => {
      v.currentTime = isFinite(v.duration) ? Math.min(1, v.duration / 4) : 0;
    };
    v.onseeked = () => { void grabFrame(v, `${base}-poster.jpg`).then(done); };
    v.src = url;
  }).finally(() => {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  });
}
