import { createSignal, createMemo, createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { wallAttach, updatePermissions } from "@/modules/files/api";
import type { FileMeta, FileAcl } from "@/modules/files/api";
import type { Photo } from "@/modules/photos/api/api";
import type { Attachment, AttachmentStore } from "./types";
import { storageGet, storageSet, storageDel } from "@utsukta/spa-core/lib/storage";
import { bbAlt } from "./insertHelpers";

// ── Serialisable subset saved to IDB ─────────────────────────────────────────
// File objects and blob: URLs are ephemeral and cannot survive a page reload,
// so we strip them when persisting and only restore ready attachments.

type DraftAttachment = {
  id: string;
  source: Attachment["source"];
  filename: string;
  isImage: boolean;
  isVideo: boolean;
  isAudio: boolean;
  hash?: string;
  revision?: number;
  resourceId?: string;
  insertUrl?: string;
  photoPageUrl?: string;
  thumbUrl?: string;   // only non-blob: URLs
  altText?: string;
  posterUrl?: string;
};

function toSerializable(a: Attachment): DraftAttachment {
  return {
    id: a.id,
    source: a.source,
    filename: a.filename,
    isImage: a.isImage,
    isVideo: a.isVideo,
    isAudio: a.isAudio,
    hash: a.hash,
    revision: a.revision,
    resourceId: a.resourceId,
    insertUrl: a.insertUrl,
    photoPageUrl: a.photoPageUrl,
    thumbUrl: a.thumbUrl?.startsWith("blob:")
      ? (a.insertUrl?.startsWith("http") ? a.insertUrl : undefined)
      : a.thumbUrl,
    altText: a.altText,
    posterUrl: a.posterUrl?.startsWith("blob:") ? undefined : a.posterUrl,
  };
}

function fromDraft(d: DraftAttachment): Attachment {
  return { ...d, status: "ready", progress: 100 };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const IMAGE_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif",
  "image/webp", "image/avif", "image/svg+xml",
]);

function isImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime.toLowerCase());
}

function isImageFilename(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|svg)$/i.test(name);
}

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

function isVideoFilename(name: string): boolean {
  return /\.(mp4|webm|ogv?|mov|avi|mkv|m4v|ts|mts|wmv|flv)$/i.test(name);
}

function isAudioMime(mime: string): boolean {
  return mime.startsWith("audio/");
}

function isAudioFilename(name: string): boolean {
  // .webm is included here too because it's a shared container: our in-app
  // audio recorder (CameraCapture) saves audio-only recordings as
  // "audio-*.webm" (MediaRecorder has no audio-specific WebM extension), so
  // the extension alone can't tell an audio-only webm from a video one —
  // that case is disambiguated by MIME below, in classifyMedia().
  return /\.(mp3|ogg|oga|wav|flac|aac|m4a|opus|webm)$/i.test(name);
}

// Classify a file as video xor audio, never both.
//
// Neither signal is trustworthy alone:
// - MIME lies for some audio containers, e.g. certain browsers report an
//   .m4a file as "video/mp4" since M4A is just an MP4 container with no
//   video track — so a video/audio MIME can't override a specific,
//   non-webm extension.
// - The extension lies for .webm specifically, since it's shared between
//   audio-only and video recordings (see isAudioFilename above) — that
//   case must fall back to MIME, which MediaRecorder sets correctly
//   ("audio/webm" vs "video/webm").
function classifyMedia(name: string, mime: string): { isVideo: boolean; isAudio: boolean } {
  const extAudio = isAudioFilename(name);
  const extVideo = isVideoFilename(name);
  if (extAudio && !extVideo) return { isVideo: false, isAudio: true };
  if (extVideo && !extAudio) return { isVideo: true, isAudio: false };
  // Ambiguous (.webm matches both lists) or no extension match — use MIME.
  if (isAudioMime(mime)) return { isVideo: false, isAudio: true };
  if (isVideoMime(mime)) return { isVideo: true, isAudio: false };
  // .webm with no/generic MIME: default to video, matching legacy behavior.
  if (extVideo) return { isVideo: true, isAudio: false };
  return { isVideo: false, isAudio: false };
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Store factory ─────────────────────────────────────────────────────────────

export function createAttachmentStore(nick: string, scope: string): AttachmentStore {
  const DRAFT_KEY = `draft-att:${scope}`;

  const [state, setState] = createStore<{ items: Attachment[] }>({ items: [] });

  let currentAcl: FileAcl | null = null;

  function applyAcl(hash: string) {
    if (!currentAcl) return;
    void updatePermissions(nick, hash, currentAcl).catch(() => {});
  }

  // Guard: don't wipe the IDB key before the async load resolves
  const [draftLoaded, setDraftLoaded] = createSignal(false);

  // Load persisted attachments from IDB on init
  storageGet<DraftAttachment[]>(DRAFT_KEY, []).then((saved) => {
    if (saved.length > 0) setState("items", saved.map(fromDraft));
    setDraftLoaded(true);
  });

  // Persist ready attachments whenever the list changes (after initial load)
  createEffect(() => {
    if (!draftLoaded()) return;
    const data = state.items
      .filter((a) => a.status === "ready")
      .map(toSerializable);
    if (data.length > 0) void storageSet(DRAFT_KEY, data);
    else void storageDel(DRAFT_KEY);
  });

  const attachments = () => state.items;
  const uploading = createMemo(() => state.items.some((a) => a.status === "uploading"));

  function update(id: string, patch: Partial<Attachment>) {
    setState("items", (a) => a.id === id, patch);
  }

  function addUploads(files: FileList | File[]) {
    const arr = Array.from(files);
    const newItems: Attachment[] = arr.map((file) => {
      const { isVideo, isAudio } = classifyMedia(file.name, file.type);
      return {
        id: uid(),
        source: "upload" as const,
        status: "uploading" as const,
        progress: 0,
        filename: file.name,
        isImage: isImageMime(file.type) || isImageFilename(file.name),
        isVideo,
        isAudio,
        thumbUrl: (isImageMime(file.type) || isImageFilename(file.name)) ? URL.createObjectURL(file) : undefined,
        file,
      };
    });

    setState("items", (prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      void (async () => {
        try {
          const res = await wallAttach(nick, item.file!, (pct) => update(item.id, { progress: pct }));
          if (res.isPhoto) {
            // Photos: resourceId = attach hash (= photo resource_id); insertUrl for [zmg] inline embed.
            // Keep the absolute URL so magic-auth works for private photos on remote servers.
            // Hubzilla's fix_attached_permissions() uses the attach record (flags=1) to update
            // photo permissions to match the post ACL when the post is submitted.
            update(item.id, {
              status: "ready",
              progress: 100,
              resourceId: res.hash,
              insertUrl: res.src,
              photoPageUrl: `${window.location.origin}/photos/${nick}/image/${res.hash}`,
            });
          } else {
            // For video/audio: use the absolute /attach/hash URL from the server response.
            // For other files: store hash,revision for the [attachment] tag.
            let insertUrl: string;
            if (item.isVideo || item.isAudio) {
              insertUrl = res.src ?? `${window.location.origin}/attach/${res.hash}`;
            } else {
              insertUrl = `${res.hash},${res.revision}`;
            }
            update(item.id, {
              status: "ready",
              progress: 100,
              hash: res.hash,
              revision: res.revision,
              insertUrl,
            });
          }
          applyAcl(res.hash);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          update(item.id, { status: "error", error: msg });
          if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
        }
      })();
    }
  }

  function addCloudFiles(files: FileMeta[]) {
    const newItems: Attachment[] = files.map((f) => ({
      id: uid(),
      source: "cloud-file" as const,
      status: "ready" as const,
      progress: 100,
      filename: f.filename,
      isImage: f.is_photo || isImageFilename(f.filename),
      isVideo: isVideoFilename(f.filename),
      isAudio: isAudioFilename(f.filename),
      hash: f.hash,
      insertUrl: `/cloud/${nick}/${f.display_path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
    }));
    setState("items", (prev) => [...prev, ...dedup(prev, newItems)]);
    for (const item of newItems) {
      if (item.hash) applyAcl(item.hash);
    }
  }

  function addPhotos(photos: Photo[]) {
    const newItems: Attachment[] = photos.map((p) => ({
      id: uid(),
      source: "photo" as const,
      status: "ready" as const,
      progress: 100,
      filename: p.filename,
      isImage: true,
      isVideo: false,
      isAudio: false,
      thumbUrl: p.src,
      insertUrl: p.src,
      photoPageUrl: p.link,
      resourceId: p.resource_id,
    }));
    setState("items", (prev) => [...prev, ...dedup(prev, newItems)]);
    for (const item of newItems) {
      if (item.resourceId) applyAcl(item.resourceId);
    }
  }

  function remove(id: string) {
    const item = state.items.find((a) => a.id === id);
    if (item?.source === "upload" && item.thumbUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.thumbUrl);
    }
    setState("items", (prev) => prev.filter((a) => a.id !== id));
  }

  function setAltText(id: string, text: string) {
    update(id, { altText: text });
  }

  /**
   * Alt edited on the other side — the editor's image popup, which only knows
   * the image's URL — so the chip's ALT badge keeps showing what the body
   * actually says. No-op for images that aren't attachments of this composer.
   */
  function setAltByUrl(url: string, text: string) {
    setState("items", (a) => a.insertUrl === url, { altText: text });
  }

  function insertBBCode(id: string): string {
    const item = state.items.find((a) => a.id === id);
    if (!item || !item.insertUrl) return "";
    if (item.isImage) {
      const label = item.altText?.trim() || item.filename;
      if (item.photoPageUrl) {
        return `[zrl=${item.photoPageUrl}][zmg=${item.insertUrl}]${label}[/zmg][/zrl]`;
      }
      return item.altText?.trim()
        ? `[img ${bbAlt(item.altText)}]${item.insertUrl}[/img]`
        : `[img]${item.insertUrl}[/img]`;
    }
    // Note: do NOT also append an [attachment] tag here for video/audio.
    // Hubzilla core already links the upload to the post via the attach
    // hash embedded in the media URL (plus the ACL update on upload) —
    // adding a second, explicit [attachment]hash,revision[/attachment] tag
    // for the same file made core register/display it as a *second*,
    // redundant attachment on the post (tried this; caused duplicates).
    if (item.isVideo) {
      return item.posterUrl
        ? `[zvideo poster='${item.posterUrl}']${item.insertUrl}[/zvideo]`
        : `[zvideo]${item.insertUrl}[/zvideo]`;
    }
    if (item.isAudio) return `[zaudio]${item.insertUrl}[/zaudio]`;
    return `[attachment]${item.insertUrl}[/attachment]`;
  }

  function addVideoWithThumbnail(video: File, thumbnail: File) {
    const id = uid();
    const item: Attachment = {
      id,
      source: "upload",
      status: "uploading",
      progress: 0,
      filename: video.name,
      isImage: false,
      isVideo: true,
      isAudio: false,
      file: video,
    };
    setState("items", (prev) => [...prev, item]);

    void (async () => {
      try {
        // Upload thumbnail first (small file) to get its URL for the poster attribute
        const thumbRes = await wallAttach(nick, thumbnail);
        const posterUrl = thumbRes.isPhoto && thumbRes.src ? thumbRes.src : undefined;
        if (thumbRes.hash) applyAcl(thumbRes.hash);

        // Now upload the video, tracking progress
        const videoRes = await wallAttach(nick, video, (pct) => update(id, { progress: pct }));
        if (videoRes.isPhoto) {
          update(id, {
            status: "ready",
            progress: 100,
            resourceId: videoRes.hash,
            insertUrl: videoRes.src,
            photoPageUrl: `${window.location.origin}/photos/${nick}/image/${videoRes.hash}`,
            posterUrl,
          });
        } else {
          const insertUrl = videoRes.src ?? `${window.location.origin}/attach/${videoRes.hash}`;
          update(id, {
            status: "ready",
            progress: 100,
            hash: videoRes.hash,
            revision: videoRes.revision,
            insertUrl,
            posterUrl,
          });
        }
        applyAcl(videoRes.hash);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        update(id, { status: "error", error: msg });
      }
    })();
  }

  function setAcl(acl: FileAcl | null) {
    currentAcl = acl;
    if (!acl) return;
    for (const att of state.items) {
      const hash = att.hash ?? att.resourceId;
      if (att.status === "ready" && hash) applyAcl(hash);
    }
  }

  function clear() {
    state.items.forEach((a) => {
      if (a.source === "upload" && a.thumbUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(a.thumbUrl);
      }
    });
    setState("items", []);
    void storageDel(DRAFT_KEY);
  }

  return { attachments, uploading, addUploads, addVideoWithThumbnail, addCloudFiles, addPhotos, remove, setAltText, setAltByUrl, insertBBCode, setAcl, clear };
}

// Prevent adding the same hash or resourceId twice
function dedup(existing: readonly Attachment[], incoming: Attachment[]): Attachment[] {
  const hashes = new Set(existing.map((a) => a.hash).filter(Boolean));
  const rids = new Set(existing.map((a) => a.resourceId).filter(Boolean));
  return incoming.filter(
    (a) =>
      !(a.hash && hashes.has(a.hash)) &&
      !(a.resourceId && rids.has(a.resourceId)),
  );
}
