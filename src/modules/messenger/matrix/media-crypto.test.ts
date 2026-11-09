// node --experimental-strip-types src/modules/messenger/matrix/media-crypto.test.ts
import assert from "node:assert";
import { decryptAttachment, encryptAttachment, safeType } from "./media-crypto.ts";

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64").replace(/=+$/, "");
const plain = new TextEncoder().encode("hello matrix attachment");

// Encrypt the way Matrix clients do (spec v2: AES-256-CTR, 64-bit counter, SHA-256 of ciphertext).
const key = await crypto.subtle.generateKey({ name: "AES-CTR", length: 256 }, true, ["encrypt", "decrypt"]);
const iv = new Uint8Array(16);
crypto.getRandomValues(iv.subarray(0, 8));
const cipher = await crypto.subtle.encrypt({ name: "AES-CTR", counter: iv, length: 64 }, key, plain);
const file = {
  url: "mxc://ex.org/abc", v: "v2", iv: b64(iv),
  key: { ...(await crypto.subtle.exportKey("jwk", key)), key_ops: ["encrypt", "decrypt"], ext: true } as never,
  hashes: { sha256: b64(new Uint8Array(await crypto.subtle.digest("SHA-256", cipher))) },
};

assert.deepEqual(new Uint8Array(await decryptAttachment(file, cipher)), plain);

const tampered = new Uint8Array(cipher.slice(0));
tampered[0] ^= 1;
await assert.rejects(decryptAttachment(file, tampered.buffer), /hash mismatch/);
await assert.rejects(decryptAttachment({ ...file, hashes: {} }, cipher), /no hash/);

// Our own encryption round-trips through our decryption.
const enc = await encryptAttachment(plain.buffer);
assert.deepEqual(new Uint8Array(await decryptAttachment({ ...enc.file, url: "mxc://ex.org/x" }, enc.data)), plain);
assert.equal(enc.file.key.alg, "A256CTR");
assert(!/=/.test(enc.file.iv) && !/=/.test(enc.file.hashes.sha256), "unpadded base64");

assert.equal(safeType("image/png"), "image/png");
assert.equal(safeType("audio/ogg"), "audio/ogg");
assert.equal(safeType("image/svg+xml"), "application/octet-stream");
assert.equal(safeType("text/html"), "application/octet-stream");
assert.equal(safeType(undefined), "application/octet-stream");

console.log("media-crypto: ok");
