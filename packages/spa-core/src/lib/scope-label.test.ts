// node --experimental-strip-types packages/spa-core/src/lib/scope-label.test.ts
import assert from "node:assert";

const { scopeLabel } = await import("./scope-label.ts");

// Stand-in for t(): echoes the key so each branch is identifiable, and proves
// interpolation reaches the site: case.
const t = (k: string, p?: Record<string, string>) => (p ? `${k}:${p.site}` : k);

// Every case from core's translate_scope() (include/items.php:1282), in order.
assert.equal(scopeLabel("", t),                 "share.scope_public");
assert.equal(scopeLabel("public", t),           "share.scope_public");
assert.equal(scopeLabel("self", t),             "share.scope_self");
assert.equal(scopeLabel("network:zot6", t),     "share.scope_network");
assert.equal(scopeLabel("authenticated", t),    "share.scope_authenticated");
assert.equal(scopeLabel("site:example.org", t), "share.scope_site:example.org");
assert.equal(scopeLabel("any connections", t),  "share.scope_connections");
assert.equal(scopeLabel("contacts", t),         "share.scope_contacts");
// The RSS / private-to-self / bcc case this was reported for.
assert.equal(scopeLabel("specific", t),         "share.scope_specific");
// Unknown scopes fall through untranslated, as core does.
assert.equal(scopeLabel("something-new", t),    "something-new");

console.log("scope-label: ok");
