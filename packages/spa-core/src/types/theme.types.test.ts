// node --experimental-strip-types packages/spa-core/src/types/theme.types.test.ts
// THEMES must match the PHP whitelist (php/Api/ColorSchemes.php) — a scheme
// the server doesn't know is silently dropped for visitors.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { THEMES } from "./theme.types.ts";

const php = readFileSync(new URL("../../php/Api/ColorSchemes.php", import.meta.url), "utf8");
const list = php.match(/const ALL = \[([^\]]*)\]/)![1];
const phpIds = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
assert.deepStrictEqual(phpIds, THEMES.map((t) => t.id).sort());
console.log("ok");
