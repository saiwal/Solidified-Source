// Extension is explicit so offline-fallback.test.ts can run under plain node.
import { storageDel, storageGet, storageKeys, storageSet } from "./storage.ts";

// Last-resort offline cache sitting under every /spa/ GET in the app.
//
// The service worker is the primary offline path; this exists because it is
// not guaranteed to be there — a failed install, an evicted cache or a
// browser that dropped the registration all leave the app with no offline
// data at all, and its Cache Storage is HTTP storage the app can neither
// inspect nor repair. IndexedDB is ours, has no expiry, and survives all of
// that.
//
// Only a *thrown* fetch falls back here — i.e. no network reached at all.
// HTTP errors (401, 500, …) pass through untouched, so a real failure still
// looks like a failure rather than silently serving yesterday's data.

// The stream poll mints a unique ?dbegin=<now> URL every tick; caching those
// would write an IndexedDB entry per poll forever.
const SKIP = /[?&]dbegin=|\/spa\/item\/counts\b|\/spa\/admin\/logs\b|\/spa\/vault\b/; // + the live-count poll (createStreamStore.refreshCounts)
// and the admin log tail (polled every few seconds; server logs don't belong in IndexedDB);
// the credential vault — its ciphertext must not sit on disk beside the key that opens it
const MAX_BODY = 512 * 1024;
const key = (url: string) => `offline:${url}`;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

// Whether a URL already has an offline copy — lets callers skip re-warming
// what's already on disk.
export async function hasOfflineCopy(url: string): Promise<boolean> {
  return (await storageGet<string | undefined>(key(url), undefined)) !== undefined;
}

// Logout: without this, the next offline launch answers /spa/pconfig from the
// recording and boots as the previous user, private streams included. Also
// empties the service worker's API caches, which hold the same responses.
// Drafts share this database and are deliberately kept.
export async function clearOfflineData(): Promise<void> {
  const ks = await storageKeys();
  await Promise.all(ks.filter((k) => k.startsWith("offline:")).map(storageDel));
  if ("caches" in globalThis) {
    await Promise.all(["theme-api", "api-config", "api-json"].map((n) => caches.delete(n)));
  }
}

export function isCacheableGet(method: string, url: string): boolean {
  return method.toUpperCase() === "GET" && !SKIP.test(url) && isSpaUrl(url);
}

export function isSpaUrl(url: string): boolean {
  try {
    return new URL(url, location.href).pathname.startsWith("/spa/");
  } catch {
    return false;
  }
}

// Hub reachability. navigator.onLine only knows whether the device has a
// link; a hub that is down (or a captive portal) still reads "online". So a
// /spa/ fetch that throws marks the hub unreachable, and any real response
// marks it reachable again. useOnlineStatus listens for REACHABILITY_EVENT.
//
// A cacheable GET can resolve from the service worker's NetworkFirst cache
// while the hub is down, so such a response proves nothing. Recovery comes
// from uncached requests (polls, writes) or the HEAD probe below — Workbox
// only routes GETs, so a HEAD always reaches the network, and any HTTP
// status (even an error) means the hub answered.
export const REACHABILITY_EVENT = "hz-hub-reachability";
const PROBE_MS = 15_000;
let reachable = true;
let probeTimer: ReturnType<typeof setInterval> | undefined;

export function hubReachable(): boolean {
  return reachable;
}

export function installOfflineFallback(): void {
  const nativeFetch = window.fetch.bind(window);

  const setReachable = (v: boolean) => {
    if (v === reachable) return;
    reachable = v;
    window.dispatchEvent(new CustomEvent(REACHABILITY_EVENT, { detail: v }));
    clearInterval(probeTimer);
    probeTimer = v
      ? undefined
      : setInterval(() => {
          nativeFetch("/spa/siteinfo", { method: "HEAD", cache: "no-store" })
            .then(() => setReachable(true))
            .catch(() => {});
        }, PROBE_MS);
  };
  // The device coming back online is worth an immediate look rather than
  // waiting out the probe interval.
  window.addEventListener("online", () => {
    if (!reachable) {
      nativeFetch("/spa/siteinfo", { method: "HEAD", cache: "no-store" })
        .then(() => setReachable(true))
        .catch(() => {});
    }
  });

  const tracked = async (input: RequestInfo | URL, init: RequestInit | undefined, swCached: boolean) => {
    try {
      const res = await nativeFetch(input, init);
      if (!swCached) setReachable(true);
      return res;
    } catch (err) {
      // An abort is the caller's choice, not the network's.
      if ((err as Error)?.name !== "AbortError") setReachable(false);
      throw err;
    }
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = requestUrl(input);
    if (!isSpaUrl(url)) return nativeFetch(input, init);
    const cacheable = isCacheableGet(method, url);
    if (!cacheable) return tracked(input, init, false);
    const swCached = !!navigator.serviceWorker?.controller;

    try {
      const res = await tracked(input, init, swCached);
      if (res.ok) {
        // Fire-and-forget: never make a live response wait on a disk write.
        res
          .clone()
          .text()
          .then((body) => {
            if (body.length <= MAX_BODY) storageSet(key(url), body);
          })
          .catch(() => {});
      }
      return res;
    } catch (err) {
      const body = await storageGet<string | undefined>(key(url), undefined);
      if (body === undefined) throw err;
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}
