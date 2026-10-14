// End-to-end encrypted credential vault — per channel, synced to clones.
//
// The hub (Handlers/Vault.php) only ever stores ciphertext: every entry is
// encrypted here, in the browser, with a key derived from a passphrase the
// user chooses. The hub can't read it, and neither can its admin — with the
// one limit every web app has: the admin serves this JavaScript, so a
// malicious admin could ship code that captures the passphrase as it's typed.
//
// Generic: each integration (jellyfin; later peertube, matrix…) stores
// { key: entry } objects of its own shape; one passphrase unlocks them all.
//
// Crypto (WebCrypto, no dependency):
//   key   = PBKDF2-SHA256(passphrase, salt, 600 000) → AES-256-GCM
//   entry = { v: 1, iv, ct } with AAD "<integration>/<key>" — the slot is
//           authenticated, so entries can't be swapped between slots unseen
//   meta  = integration "_vault", key "meta": { v, kdf, iter, salt, check }
//           (public parameters + an encrypted known value to tell a wrong
//           passphrase from a right one). The KDF is recorded so it can move
//           to Argon2id later without breaking existing vaults.
// The derived key is cached per browser in IndexedDB as a *non-extractable*
// CryptoKey, keyed by the channel's hash (shared by its clones): unlock once
// per browser; scripts can use the key but never read it out.
import { apiFetch } from "./fetch";
import { useAuth } from "../store/auth-store";

const ITER = 600_000;
const META = "_vault";
const enc = new TextEncoder();
const dec = new TextDecoder();

export class VaultLockedError extends Error {
  constructor() { super("vault locked"); }
}

interface Sealed { v: 1; iv: string; ct: string }
interface Meta { v: 1; kdf: "PBKDF2-SHA256"; iter: number; salt: string; check: Sealed }

const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const path = (integration: string) => `/spa/vault/${encodeURIComponent(integration)}`;
const channel = () => useAuth()()?.hash ?? "";

// ── raw transport (the hub's map of opaque objects) ───────────────────────────

async function rawList(integration: string): Promise<Record<string, unknown>> {
  const r = await apiFetch(path(integration));
  if (!r.ok) throw new Error(`vault ${r.status}`);
  return (await r.json()).data ?? {};
}

async function rawPost(integration: string, body: object): Promise<void> {
  const r = await apiFetch(path(integration), { method: "POST", body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`vault ${r.status}`);
}

// ── key cache (IndexedDB, non-extractable) ────────────────────────────────────

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("hz-vault", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction("keys", mode).objectStore("keys"));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

let cached: { channel: string; key: CryptoKey } | null = null;

async function currentKey(): Promise<CryptoKey | null> {
  const ch = channel();
  if (!ch) return null;
  if (cached?.channel === ch) return cached.key;
  const key = await idb<CryptoKey>("readonly", (s) => s.get(ch)).catch(() => undefined);
  if (key) cached = { channel: ch, key };
  return key ?? null;
}

// ── crypto ────────────────────────────────────────────────────────────────────

async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    base, { name: "AES-GCM", length: 256 },
    false, // non-extractable: usable, never readable
    ["encrypt", "decrypt"],
  );
}

async function seal(key: CryptoKey, aad: string, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(value)));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}

/** null when it doesn't open (wrong key, tampered, or not a sealed entry). */
async function open<T>(key: CryptoKey, aad: string, s: unknown): Promise<T | null> {
  const x = s as Partial<Sealed>;
  if (!x || x.v !== 1 || typeof x.iv !== "string" || typeof x.ct !== "string") return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(x.iv), additionalData: enc.encode(aad) }, key, unb64(x.ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    return null;
  }
}

const CHECK = "hz-vault-ok";

// ── public API ────────────────────────────────────────────────────────────────

export type VaultStatus = "new" | "locked" | "unlocked";

/** "new": no passphrase chosen yet; "locked": one exists but this browser hasn't unlocked it. */
export async function vaultStatus(): Promise<VaultStatus> {
  const meta = (await rawList(META)).meta as Meta | undefined;
  if (!meta) return "new";
  return (await currentKey()) ? "unlocked" : "locked";
}

/**
 * Unlock this browser with the passphrase — or, on a "new" vault, set it.
 * Returns false for a wrong passphrase. The derived key is kept in this
 * browser (non-extractable) so it isn't asked for again.
 */
export async function unlockVault(passphrase: string): Promise<boolean> {
  const ch = channel();
  if (!ch || !passphrase) return false;
  let meta = (await rawList(META)).meta as Meta | undefined;
  let key: CryptoKey;
  if (!meta) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    key = await derive(passphrase, salt, ITER);
    meta = { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), check: await seal(key, `${META}/check`, CHECK) };
    await rawPost(META, { key: "meta", entry: meta });
  } else {
    key = await derive(passphrase, unb64(meta.salt), meta.iter);
    if ((await open<string>(key, `${META}/check`, meta.check)) !== CHECK) return false;
  }
  await idb("readwrite", (s) => s.put(key, ch));
  cached = { channel: ch, key };
  return true;
}

/** Forget the key in this browser (the vault itself is untouched). */
export async function lockVault(): Promise<void> {
  cached = null;
  const ch = channel();
  if (ch) await idb("readwrite", (s) => s.delete(ch)).catch(() => undefined);
}

/**
 * A forgotten passphrase can't be recovered: this deletes the passphrase and
 * every entry of the named integrations, so a new one can be chosen.
 */
export async function resetVault(integrations: string[]): Promise<void> {
  for (const i of integrations) {
    for (const k of Object.keys(await rawList(i))) await rawPost(i, { key: k, delete: 1 });
  }
  await rawPost(META, { key: "meta", delete: 1 });
  await lockVault();
}

/** Decrypted entries. Throws VaultLockedError if this browser hasn't unlocked the vault. */
export async function vaultList<T extends object>(integration: string): Promise<Record<string, T>> {
  const key = await currentKey();
  if (!key) throw new VaultLockedError();
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(await rawList(integration))) {
    const entry = await open<T>(key, `${integration}/${k}`, v);
    if (entry) out[k] = entry; // anything that doesn't open (old format, tampered) is skipped
  }
  return out;
}

/**
 * How many entries the hub holds for an integration, readable or not — so a
 * caller can tell "nothing saved" from "saved, but it doesn't open".
 */
export async function vaultSlots(integration: string): Promise<number> {
  return Object.keys(await rawList(integration)).length;
}

export async function vaultPut<T extends object>(integration: string, key: string, entry: T): Promise<void> {
  const k = await currentKey();
  if (!k) throw new VaultLockedError();
  await rawPost(integration, { key, entry: await seal(k, `${integration}/${key}`, entry) });
}

/** Deleting needs no key: anyone signed in as the channel may remove an entry. */
export const vaultDelete = (integration: string, key: string) => rawPost(integration, { key, delete: 1 });
