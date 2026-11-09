// Pure attachment helpers (no SDK import), so media-crypto.test.ts runs in node.
import type { EncryptedFile } from "matrix-js-sdk/lib/@types/media.js";

// A blob: URL runs in the hub's origin, so only types that can't script keep
// their mimetype (no SVG, no HTML). Anything else becomes an opaque download.
const SAFE = /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/[\w.+-]+)$/i;
export const safeType = (mime?: string) => (mime && SAFE.test(mime) ? mime : "application/octet-stream");

const unb64 = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(t + "=".repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
};
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, "");

export async function decryptAttachment(file: EncryptedFile, data: ArrayBuffer): Promise<ArrayBuffer> {
  const expected = file.hashes?.sha256;
  if (!expected) throw new Error("attachment has no hash");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  if (b64(digest) !== expected.replace(/=+$/, "")) throw new Error("attachment hash mismatch");
  const key = await crypto.subtle.importKey("jwk", file.key as JsonWebKey, { name: "AES-CTR" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-CTR", counter: unb64(file.iv), length: 64 }, key, data);
}

/** Encrypt an attachment for an encrypted room; upload `data`, then send `file` with its `url` set. */
export async function encryptAttachment(plain: ArrayBuffer): Promise<{ data: ArrayBuffer; file: Omit<EncryptedFile, "url"> }> {
  const key = await crypto.subtle.generateKey({ name: "AES-CTR", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = new Uint8Array(16); // spec: random high 64 bits, zero counter half
  crypto.getRandomValues(iv.subarray(0, 8));
  const data = await crypto.subtle.encrypt({ name: "AES-CTR", counter: iv, length: 64 }, key, plain);
  const jwk = await crypto.subtle.exportKey("jwk", key);
  return {
    data,
    file: {
      v: "v2",
      iv: b64(iv),
      key: { alg: "A256CTR", ext: true, k: jwk.k!, key_ops: ["encrypt", "decrypt"], kty: "oct" },
      hashes: { sha256: b64(new Uint8Array(await crypto.subtle.digest("SHA-256", data))) },
    },
  };
}
