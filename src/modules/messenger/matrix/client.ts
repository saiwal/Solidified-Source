// The only file that imports matrix-js-sdk (plus the views that receive its
// objects). Loaded only when Messenger's Matrix tab opens; HEAVY_TOOLS in
// build-sw.mjs keeps out of the SW precache, along with the 7.8 MB crypto wasm.
// Once started, the client keeps syncing across SPA navigation until reload or
// logout, so coming back to the tab is instant.
import * as sdk from "matrix-js-sdk";
import {
  CryptoEvent, decodeRecoveryKey, deriveRecoveryKeyFromPassphrase, type VerificationRequest,
} from "matrix-js-sdk/lib/crypto-api/index.js";
import { createSignal } from "solid-js";
import { clearSession, currentUid, dbPrefix, loadSession, saveSession, type MatrixSession } from "../matrix-session";

export { sdk };

const [client, setClient] = createSignal<sdk.MatrixClient | null>(null);
const [syncState, setSyncState] = createSignal<string>("");
/** Bumped on any room/timeline/decryption change; views read it to re-derive. */
const [tick, setTick] = createSignal(0);
export { client, syncState, tick };
/** The self-verification in progress (ours or another device's), shown as a modal. */
const [verification, setVerification] = createSignal<VerificationRequest | null>(null);
export { verification };
const bump = () => setTick((n) => n + 1);

// Set only while recover() runs; the SDK asks for it through the callback.
let pendingSecret: string | null = null;

let starting: Promise<void> | null = null;

/** Resume a stored session (no-op if already running or none stored). */
export function resume(): Promise<void> {
  if (client()) return Promise.resolve();
  const s = loadSession();
  if (!s) return Promise.resolve();
  return (starting ??= start(s).finally(() => { starting = null; }));
}

async function start(s: MatrixSession): Promise<void> {
  const store = new sdk.IndexedDBStore({ indexedDB: window.indexedDB, dbName: `${dbPrefix(s)}-sync`, localStorage: window.localStorage });
  const c = sdk.createClient({
    baseUrl: s.baseUrl,
    accessToken: s.accessToken,
    userId: s.userId,
    deviceId: s.deviceId,
    store,
    timelineSupport: true,
    cryptoCallbacks: {
      getSecretStorageKey: async ({ keys }) => {
        if (!pendingSecret) return null;
        const [id, info] = Object.entries(keys)[0];
        let key: Uint8Array<ArrayBuffer>;
        try {
          key = decodeRecoveryKey(pendingSecret);
        } catch (e) {
          if (!info.passphrase) throw e;
          key = await deriveRecoveryKeyFromPassphrase(pendingSecret, info.passphrase.salt, info.passphrase.iterations);
        }
        return [id, key];
      },
    },
  });
  await store.startup();
  await c.initRustCrypto({ cryptoDatabasePrefix: dbPrefix(s) });
  c.on(sdk.ClientEvent.Sync, (state) => { setSyncState(state); bump(); });
  c.on(sdk.ClientEvent.Room, bump);
  c.on(sdk.RoomEvent.Timeline, bump);
  c.on(sdk.RoomEvent.Receipt, bump);
  c.on(sdk.RoomEvent.MyMembership, bump);
  c.on(sdk.RoomEvent.Name, bump);
  c.on(sdk.RoomEvent.Redaction, bump); // un-reactions, deleted messages
  c.on(sdk.RoomEvent.LocalEchoUpdated, bump); // a sent reaction/message gets its real id
  c.on(sdk.MatrixEventEvent.Decrypted, bump);
  // Another of your sessions asks to verify this one.
  c.on(CryptoEvent.VerificationRequestReceived, (req) => {
    if (req.isSelfVerification && !verification()) setVerification(req);
  });
  c.on(CryptoEvent.UserTrustStatusChanged, bump);
  // After verification the other device gossips the backup key: pull the
  // backup in, so older encrypted history decrypts without the recovery key.
  c.on(CryptoEvent.KeyBackupDecryptionKeyCached, () => {
    const crypto = c.getCrypto();
    void crypto?.checkKeyBackupAndEnable()
      .then(() => crypto.restoreKeyBackup())
      .then(bump)
      .catch(() => {});
  });
  // An expired/revoked token: drop the session rather than retry forever.
  c.on(sdk.HttpApiEvent.SessionLoggedOut, () => { void logout(false); });
  await c.startClient({ initialSyncLimit: 20, lazyLoadMembers: true });
  setClient(c);
}

/** Homeserver base url for a Matrix ID's server part, via .well-known. */
export async function discover(server: string): Promise<string> {
  try {
    const hs = (await sdk.AutoDiscovery.findClientConfig(server))["m.homeserver"];
    if (hs.state === sdk.AutoDiscovery.SUCCESS && hs.base_url) return hs.base_url;
  } catch { /* no well-known: try the server name itself */ }
  return `https://${server}`;
}

export const serverOf = (mxid: string) => mxid.slice(mxid.indexOf(":") + 1);

/** Which login methods the homeserver offers. */
export async function loginFlows(baseUrl: string): Promise<{ password: boolean; sso: boolean }> {
  const flows = (await sdk.createClient({ baseUrl }).loginFlows()).flows;
  return {
    password: flows.some((f) => f.type === "m.login.password"),
    sso: flows.some((f) => f.type === "m.login.sso" || f.type === "m.login.cas"),
  };
}

async function finishLogin(baseUrl: string, req: sdk.LoginRequest): Promise<void> {
  const r = await sdk.createClient({ baseUrl }).loginRequest({
    ...req,
    initial_device_display_name: `Hubzilla (${location.host})`,
  });
  const s: MatrixSession = { uid: currentUid(), baseUrl, userId: r.user_id, deviceId: r.device_id, accessToken: r.access_token };
  saveSession(s);
  await start(s);
}

export function loginWithPassword(baseUrl: string, mxid: string, password: string): Promise<void> {
  return finishLogin(baseUrl, { type: "m.login.password", identifier: { type: "m.id.user", user: mxid }, password });
}

const SSO_KEY = "hz-matrix-sso";
/** Leave for the homeserver's SSO page; it comes back to `returnUrl`?loginToken=. */
export function startSso(baseUrl: string, returnUrl: string): void {
  try { sessionStorage.setItem(SSO_KEY, baseUrl); } catch { /* the return leg will fail visibly */ }
  location.href = sdk.createClient({ baseUrl }).getSsoLoginUrl(returnUrl, "sso");
}

export async function finishSso(token: string): Promise<void> {
  let baseUrl: string | null = null;
  try { baseUrl = sessionStorage.getItem(SSO_KEY); sessionStorage.removeItem(SSO_KEY); } catch { /* none */ }
  if (!baseUrl) throw new Error("SSO session lost");
  await finishLogin(baseUrl, { type: "m.login.token", token });
}

export async function logout(serverSide = true): Promise<void> {
  const c = client();
  const s = loadSession();
  setClient(null);
  if (s) clearSession(s.uid);
  if (!c) return;
  if (serverSide) await c.logout(true).catch(() => {});
  c.stopClient();
  if (s) await c.clearStores({ cryptoDatabasePrefix: dbPrefix(s) }).catch(() => {});
}

/** Unlock secret storage with a recovery key or passphrase: cross-signs this
 *  device and restores the key backup, so older encrypted history decrypts. */
export async function recover(secret: string): Promise<number> {
  const crypto = client()?.getCrypto();
  if (!crypto) throw new Error("no crypto");
  pendingSecret = secret.trim();
  try {
    await crypto.bootstrapCrossSigning({});
    await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
    await crypto.checkKeyBackupAndEnable();
    const r = await crypto.restoreKeyBackup();
    bump();
    return r.imported;
  } finally {
    pendingSecret = null;
  }
}

/** Ask your other sessions (Element…) to verify this one. */
export async function startSelfVerification(): Promise<void> {
  const crypto = client()?.getCrypto();
  if (!crypto) throw new Error("no crypto");
  setVerification(await crypto.requestOwnUserVerification());
}
export const endVerification = () => setVerification(null);

export async function needsRecovery(): Promise<boolean> {
  const crypto = client()?.getCrypto();
  return !!crypto && !(await crypto.isCrossSigningReady());
}

// ── rooms ─────────────────────────────────────────────────────────────────────

function directMap(c: sdk.MatrixClient): Record<string, string[]> {
  return (c.getAccountData(sdk.EventType.Direct)?.getContent() ?? {}) as Record<string, string[]>;
}

/** Room ids that are DMs, from m.direct. */
export function directRoomIds(c: sdk.MatrixClient): Set<string> {
  return new Set(Object.values(directMap(c)).flat());
}

/** Existing joined/invited DM with `mxid`, or a new encrypted one. */
export async function openDirect(mxid: string): Promise<string> {
  const c = client();
  if (!c) throw new Error("not logged in");
  const direct = directMap(c);
  for (const id of direct[mxid] ?? []) {
    const m = c.getRoom(id)?.getMyMembership();
    if (m === sdk.KnownMembership.Join || m === sdk.KnownMembership.Invite) return id;
  }
  const { room_id } = await c.createRoom({
    is_direct: true,
    invite: [mxid],
    preset: sdk.Preset.TrustedPrivateChat,
    initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
  });
  await c.setAccountData(sdk.EventType.Direct, { ...direct, [mxid]: [...(direct[mxid] ?? []), room_id] } as never);
  return room_id;
}
