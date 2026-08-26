// build-sw.mjs
import { generateSW } from 'workbox-build';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { ASSET_WEB_PATH, SW_OUT_DIR_REL } from './theme.config.mjs';
import assert from 'assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The stream poll tick (createStreamStore.checkForNew) requests
// /spa/network?...&dbegin=<now> — a brand-new URL every ~30s. Caching those
// would churn the whole offline archive out of the LRU within an hour, so
// they're routed NetworkOnly.
const POLL_URL = /\/spa\/.*[?&]dbegin=/;
assert(POLL_URL.test('https://h/spa/network?order=created&dbegin=2026-08-16%2010%3A00%3A00'));
assert(POLL_URL.test('https://h/spa/channel/bob?dbegin=x'));
assert(!POLL_URL.test('https://h/spa/network?star=1'));

const OUT_DIR = path.resolve(__dirname, SW_OUT_DIR_REL);

const { count, size } = await generateSW({
  swDest: path.join(OUT_DIR, 'sw.js'),
  globDirectory: OUT_DIR,
  // Shell only: the hashed app chunks plus the PWA icons.
  // Deliberately NOT recursive — the subdirectories hold 31 MB of ffmpeg
  // wasm, 15 MB of background patterns, 10 MB of puzzle wasm and 4 MB of
  // fonts. Precaching those made SW install a 36 MB download, which mobile
  // browsers fail or evict outright — and a failed install means no service
  // worker at all, so offline stopped working entirely. They're runtime-cached
  // on first use instead (see hz-assets below); ffmpeg is left uncached, a
  // 32 MB entry is not worth an origin's storage quota. Individually large
  // *top-level* chunks (Excalidraw/mermaid, Filerobot) get the same
  // runtime-cached treatment via globIgnores + hz-heavy-chunks below, since
  // flat non-recursive globbing can't otherwise separate them from the shell.
  globPatterns: ['*.{js,css}', '*.{png,svg,ico}'],
  globIgnores: [
    'sw.js',
    // Excalidraw's canvas + its bundled "mermaid to diagram" conversion
    // feature (mermaid core, cytoscape/dagre/cose-bilkent layout engines, one
    // chunk per diagram type) and the Filerobot image editor are ~6 MB of
    // chunks that are only ever dynamically imported when a user opens one of
    // those tools — never part of the app shell. Flat non-recursive globbing
    // (see comment above) can't tell eager chunks from lazy ones by directory,
    // so they're excluded by name here and runtime-cached instead (see
    // hz-heavy-chunks below), same treatment as fonts/patterns/puzzles.
    'app-Excalidraw*.js',
    'app-vendor-image-editor-*.js',
    'app-cytoscape.esm-*.js',
    'app-dagre*.js',
    'app-cose-bilkent*.js',
    'app-mermaid*.js',
    'app-*Diagram*.js',
    'app-swimlanes*.js',
    // ponytail: these two are Rollup's auto-generated shared-chunk ids (the
    // "EIO257PC"/"FOHPRMQF" segments are content hashes, not source names),
    // so the exact match can go stale on a rebuild that reshuffles chunk
    // boundaries — if the [SW] precache-size assert trips again after an
    // unrelated dependency bump, re-check `du -h assets/*.js | sort -rh` for
    // a new large un-ignored "chunk-*" file before raising the limit.
    'app-chunk-EIO257PC-*.js',
    'app-chunk-FOHPRMQF-*.js',
  ],
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

  // app-*.js/css names contain a content hash; the URL itself is the revision
  dontCacheBustURLsMatching: /app-[^/]+\.(?:js|css)$/,

  modifyURLPrefix: { '': `${ASSET_WEB_PATH}/` },

  navigateFallback: null,

  skipWaiting: true,
  clientsClaim: true,

  runtimeCaching: [
    {
      urlPattern: /\/pconfig(\?.*)?$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-config',
        networkTimeoutSeconds: 5,
        expiration: { maxAgeSeconds: 86400 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /\?format=json/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-json',
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 120, maxAgeSeconds: 300 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    { urlPattern: POLL_URL, handler: 'NetworkOnly' },
    {
      // Long-lived offline archive: online this always tries the network
      // first, so nothing goes stale; offline the last-seen response for each
      // stream URL stays readable for a month.
      urlPattern: /^https?:\/\/[^/]+\/spa\//,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'theme-api',
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 300, maxAgeSeconds: 30 * 86400 },
        cacheableResponse: { statuses: [0, 200] },
        // Every /spa/ response carries `Vary: Accept-Encoding`. The browser
        // hides Accept-Encoding from the SW's view of a Request, so a stored
        // entry can become unmatchable — a cache that looks empty offline.
        matchOptions: { ignoreVary: true },
      },
    },
    {
      // Without this a cold start while offline (reopened tab, PWA launch)
      // gets no HTML at all and the precached assets are unreachable. The
      // shell names content-hashed assets, so a refresh whenever online keeps
      // it pointing at whatever the precache currently holds.
      urlPattern: ({ request, url }) =>
        request.mode === 'navigate' && url.origin === self.location.origin,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'app-shell',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 20, maxAgeSeconds: 30 * 86400 },
        cacheableResponse: { statuses: [200] },
        matchOptions: { ignoreVary: true },
        // Nothing cached for *this* URL: serve the shell warmed at install
        // (see SHELL_URL below). Every SPA route gets the same HTML, so any
        // deep link boots offline. handlerDidError only fires when the network
        // genuinely failed, so online navigations to real Hubzilla endpoints
        // (/cloud downloads, classic pages, OWA) are untouched — which is why
        // this is not workbox's navigateFallback.
        plugins: [
          {
            handlerDidError: async () =>
              (await caches.match('/hq', { cacheName: 'app-shell', ignoreVary: true })) ||
              // Warm failed at install; any earlier real navigation will do.
              caches.match('/', { cacheName: 'app-shell', ignoreVary: true }),
          },
        ],
      },
    },
    {
      urlPattern: /\/photo\//,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'hz-photos',
        expiration: { maxEntries: 500, maxAgeSeconds: 30 * 86400 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Bulk theme assets, pulled out of the precache: whichever font family,
      // background pattern or puzzle the user actually loads gets kept, rather
      // than shipping all of them to every device up front.
      // ponytail: CacheFirst on unhashed paths — a changed pattern/font file
      // keeps serving stale for 30 days; hash them if that ever matters.
      urlPattern: /\/assets\/(fonts|patterns|bg|puzzles)\//,
      handler: 'CacheFirst',
      options: {
        cacheName: 'hz-assets',
        expiration: { maxEntries: 80, maxAgeSeconds: 30 * 86400 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Excalidraw/mermaid + Filerobot chunks excluded from the precache
      // above — content-hashed and immutable, so CacheFirst is safe; they're
      // fetched (and cached) the first time a user actually opens one of
      // those tools rather than on every install.
      urlPattern: /\/assets\/app-(Excalidraw|vendor-image-editor|cytoscape\.esm|dagre|cose-bilkent|mermaid|chunk-EIO257PC|chunk-FOHPRMQF|[A-Za-z0-9]*Diagram|swimlanes)[^/]*\.(js|css)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'hz-heavy-chunks',
        expiration: { maxEntries: 40, maxAgeSeconds: 30 * 86400 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https?:\/\/(?!hz-ddev\.ddev\.site).+\.(jpg|jpeg|png|webp|gif)/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'remote-avatars',
        expiration: { maxEntries: 200, maxAgeSeconds: 3 * 86400 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

// Workbox's generateSW() only produces precaching/runtimeCaching logic — it has
// no notion of Web Push. Append a plain push/notificationclick listener to the
// generated file rather than switching to injectManifest for this one addition.
const PUSH_SW_SNIPPET = `
// The PWA launches at start_url /hq, but /hq is only ever reached by the
// client-side redirect in App.tsx — so no navigation response for it exists,
// and the first-ever visit isn't SW-controlled either. Without this warm, a
// first launch while offline gets no HTML at all and renders blank.
// /spa/pconfig + /spa/nav are the only two requests the chrome needs to render.
self.addEventListener('install', function (event) {
  event.waitUntil(
    Promise.all([
      ['/hq', 'app-shell'],
      ['/spa/pconfig', 'theme-api'],
      ['/spa/nav', 'theme-api'],
    ].map(function (pair) {
      return Promise.all([
        fetch(pair[0], { credentials: 'same-origin', cache: 'reload' }),
        caches.open(pair[1]),
      ]).then(function (r) {
        var res = r[0];
        if (!res.ok) return;
        // A Response with the redirect flag set cannot be handed to a
        // navigation's respondWith() — the browser throws and the launch fails
        // with "unable to open". /hq redirects for a logged-out install, so
        // rebuild the response body-first to clear the flag before storing.
        return res.blob().then(function (body) {
          return r[1].put(
            pair[0],
            new Response(body, { status: 200, headers: res.headers }),
          );
        });
      });
      // A failed warm must never fail the install — no SW at all is far worse
      // than a cold cache.
    })).catch(function () {})
  );
});

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  var title = data.title || 'Hubzilla';
  var options = {
    body: data.body || '',
    icon: data.icon || undefined,
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url === url && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
`;
fs.appendFileSync(path.join(OUT_DIR, 'sw.js'), PUSH_SW_SNIPPET);

console.log(`[SW] ${count} files precached, ${(size / 1024).toFixed(1)} KB`);

// A precache this size installs in one shot on a phone; past ~10 MB mobile
// browsers start failing or evicting the install, which silently kills every
// offline feature. If this trips, runtime-cache the new bulk asset instead of
// raising the limit.
assert(
  size < 10 * 1024 * 1024,
  `[SW] precache is ${(size / 1048576).toFixed(1)} MB — too large to install reliably on mobile`,
);
