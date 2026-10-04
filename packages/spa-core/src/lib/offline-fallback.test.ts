// node --experimental-strip-types packages/spa-core/src/lib/offline-fallback.test.ts
import assert from "node:assert";

(globalThis as any).location = { href: "https://example.org/network" };

const { isCacheableGet } = await import("./offline-fallback.ts");

assert(isCacheableGet("GET", "/spa/network?star=1"));
assert(isCacheableGet("get", "https://example.org/spa/hq-messages?offset=0"));
// poll URLs are unique per tick — caching them fills IndexedDB forever
assert(!isCacheableGet("GET", "/spa/network?order=created&dbegin=2026-08-16"));
assert(!isCacheableGet("GET", "/spa/item/counts?uid=2&uuids%5B%5D=x"));
// mutations must never be served from cache
assert(!isCacheableGet("POST", "/spa/item"));
// classic API and non-API paths are none of our business
assert(!isCacheableGet("GET", "/api/z/1.0/channel/stream"));
assert(!isCacheableGet("GET", "/photo/abc"));

console.log("offline-fallback: ok");
