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
const SKIP = /[?&]dbegin=/;
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
  if (method.toUpperCase() !== "GET" || SKIP.test(url)) return false;
  try {
    return new URL(url, location.href).pathname.startsWith("/spa/");
  } catch {
    return false;
  }
}

export function installOfflineFallback(): void {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = requestUrl(input);
    if (!isCacheableGet(method, url)) return nativeFetch(input, init);

    try {
      const res = await nativeFetch(input, init);
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
