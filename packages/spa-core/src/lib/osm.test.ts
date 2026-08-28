// node --experimental-strip-types packages/spa-core/src/lib/osm.test.ts
import assert from "node:assert/strict";
import { osmEmbedSrc, osmLink, parseCoord } from "./osm.ts";

// parseCoord — core writes "lat lon"; bb_map_coords also accepts "lat/lon"
assert.deepEqual(parseCoord("48.01234 9.4321"), { lat: 48.01234, lon: 9.4321 });
assert.deepEqual(parseCoord("48.01234/9.4321"), { lat: 48.01234, lon: 9.4321 });
assert.deepEqual(parseCoord(" -33.86 151.20 "), { lat: -33.86, lon: 151.2 });
assert.equal(parseCoord("foo"), null);
assert.equal(parseCoord("48"), null);
assert.equal(parseCoord("91 0"), null, "latitude out of range");
assert.equal(parseCoord("0 181"), null, "longitude out of range");

// osmEmbedSrc — the ±0.01 bbox core's openstreetmap_generate_map() builds
const src = osmEmbedSrc({ lat: 48, lon: 9 });
assert.ok(src.includes(encodeURIComponent("8.99,47.99,9.01,48.01")), src);
assert.ok(src.includes("marker=48,9"), src);
assert.ok(!osmEmbedSrc({ lat: 48, lon: 9 }, undefined, 0).includes("marker="));

assert.ok(osmLink({ lat: 48, lon: 9 }).includes("#map=16/48/9"));

console.log("osm.test.ts ok");
