// node --experimental-strip-types packages/spa-core/src/i18n/locales/pirate/pirate.test.ts
import assert from "node:assert";
import { piratize } from "./piratize.ts";

assert.equal(piratize("Hello, my friend"), "Ahoy, me matey");
assert.equal(piratize("Delete the message"), "Scuttle th' missive");

// {{placeholders}} survive intact; the text around them does not
assert.equal(
  piratize("You're viewing {{nick}}'s channel"),
  "Ye be viewing {{nick}}'s ship",
);

// idempotent — the dict is re-flattened on every locale change
for (const s of ["Hello, my friend", "Delete the message", "No files found", "Your settings"]) {
  assert.equal(piratize(piratize(s)), piratize(s), s);
}

console.log("pirate: ok");
