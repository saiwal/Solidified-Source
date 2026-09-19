// node --experimental-strip-types packages/spa-core/src/lib/zid.test.ts
import assert from "node:assert";
import { zid, zidifyLinks } from "./zid.ts";

const me = "bob@myhub.example";
const host = "myhub.example";

// cross-hub zrl image gets the zid — this is the DM-with-private-images case
assert.equal(
  zidifyLinks('<img class="zrl" src="https://her.hub/photo/abc-1.jpg" />', me, host),
  '<img class="zrl" src="https://her.hub/photo/abc-1.jpg?zid=bob%40myhub.example" />',
);
// same hub: nothing to authenticate
assert.equal(
  zidifyLinks('<img class="zrl" src="https://myhub.example/photo/x" />', me, host),
  '<img class="zrl" src="https://myhub.example/photo/x" />',
);
// plain [img] is not a zrl — core leaves it alone too
assert.equal(
  zidifyLinks('<img src="https://her.hub/photo/x" />', me, host),
  '<img src="https://her.hub/photo/x" />',
);
// zrl anchors get it as well
assert.match(zidifyLinks('<a class="zrl" href="https://her.hub/channel/x">x</a>', me, host), /zid=bob/);
// anonymous / not yet loaded: unchanged
assert.equal(zidifyLinks('<img class="zrl" src="https://her.hub/p" />', "", host),
  '<img class="zrl" src="https://her.hub/p" />');
// idempotent, and existing query args survive as entities
assert.equal(zid("https://her.hub/p?a=1&amp;b=2", me, host),
  "https://her.hub/p?a=1&amp;b=2&amp;zid=bob%40myhub.example");
assert.equal(zid("https://her.hub/p?zid=x", me, host), "https://her.hub/p?zid=x");

console.log("zid.test.ts ok");
