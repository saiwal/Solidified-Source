// mxc:// media → object URL. Authenticated download (Matrix 1.11, bearer
// token) where the server supports it, legacy unauthenticated otherwise.
// Encrypted rooms send `file` (EncryptedFile) instead of `url`: checked
// against its SHA-256 and AES-CTR decrypted here, since the SDK doesn't.
import type { EncryptedFile } from "matrix-js-sdk/lib/@types/media.js";
import { client } from "./client";
import { decryptAttachment, encryptAttachment, safeType } from "./media-crypto";

export type MediaSource = { url?: string; file?: EncryptedFile };

let authMedia: Promise<boolean> | null = null;

async function fetchMxc(mxc: string, thumb?: { w: number; h: number }): Promise<{ data: ArrayBuffer; type: string }> {
  const c = client();
  if (!c) throw new Error("not signed in");
  authMedia ??= c.isVersionSupported("v1.11").catch(() => false);
  const auth = await authMedia;
  const url = c.mxcUrlToHttp(mxc, thumb?.w, thumb?.h, thumb ? "scale" : undefined, false, true, auth);
  if (!url) throw new Error("bad mxc url");
  const r = await fetch(url, auth ? { headers: { Authorization: `Bearer ${c.getAccessToken()}` } } : {});
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { data: await r.arrayBuffer(), type: r.headers.get("Content-Type") ?? "" };
}

// ponytail: object URLs are never revoked — fine for a session's worth of
// media; add an LRU with URL.revokeObjectURL if long sessions grow memory.
const cache = new Map<string, Promise<string>>();

/** Object URL for an attachment (or a server-side thumbnail of an unencrypted one). */
export function mediaUrl(src: MediaSource, mimetype: string | undefined, thumb?: { w: number; h: number }): Promise<string> {
  const id = src.file?.url ?? src.url ?? "";
  if (!id.startsWith("mxc://")) return Promise.reject(new Error("no media"));
  const key = `${id}|${src.file ? "" : thumb ? `${thumb.w}x${thumb.h}` : ""}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      if (src.file) {
        const data = await decryptAttachment(src.file, (await fetchMxc(src.file.url)).data);
        return URL.createObjectURL(new Blob([data], { type: safeType(mimetype) }));
      }
      // Thumbnails/avatars have no declared type: trust the server's, through the same allowlist.
      const r = await fetchMxc(id, thumb);
      return URL.createObjectURL(new Blob([r.data], { type: safeType(thumb ? r.type.split(";")[0] : mimetype ?? r.type.split(";")[0]) }));
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

// ── sending ───────────────────────────────────────────────────────────────────

const msgtypeFor = (mime: string) =>
  mime.startsWith("image/") ? "m.image" : mime.startsWith("video/") ? "m.video" : mime.startsWith("audio/") ? "m.audio" : "m.file";

let maxUpload: Promise<number | undefined> | null = null;

/**
 * Upload one file and post it to the room — encrypted first when the room is.
 * ponytail: no thumbnail is generated; viewers fall back to the full file
 * (ours does). Add one (canvas → JPEG) if large photos feel slow elsewhere.
 */
export async function sendAttachment(roomId: string, f: File, onProgress?: (fraction: number) => void): Promise<void> {
  const c = client();
  if (!c) throw new Error("not signed in");
  authMedia ??= c.isVersionSupported("v1.11").catch(() => false);
  maxUpload ??= authMedia.then((auth) => c.getMediaConfig(auth)).then((m) => m["m.upload.size"]).catch(() => undefined);
  const limit = await maxUpload;
  if (limit && f.size > limit) throw new Error(`${f.name}: ${Math.round(f.size / 1048576)} MB > ${Math.round(limit / 1048576)} MB`);

  const mime = f.type || "application/octet-stream";
  const msgtype = msgtypeFor(mime);
  const info: Record<string, unknown> = { mimetype: mime, size: f.size };
  if (msgtype === "m.image") {
    try {
      const bmp = await createImageBitmap(f);
      info.w = bmp.width;
      info.h = bmp.height;
      bmp.close();
    } catch { /* undecodable here: send without dimensions */ }
  }

  const encrypted = !!c.getRoom(roomId)?.hasEncryptionStateEvent();
  const progressHandler = onProgress ? (p: { loaded: number; total: number }) => onProgress(p.total ? p.loaded / p.total : 0) : undefined;
  const content: Record<string, unknown> = { msgtype, body: f.name, filename: f.name, info };
  if (encrypted) {
    const enc = await encryptAttachment(await f.arrayBuffer());
    const up = await c.uploadContent(new Blob([enc.data]), { type: "application/octet-stream", includeFilename: false, progressHandler });
    content.file = { ...enc.file, url: up.content_uri };
  } else {
    const up = await c.uploadContent(f, { type: mime, name: f.name, progressHandler });
    content.url = up.content_uri;
  }
  await c.sendMessage(roomId, content as never);
}
