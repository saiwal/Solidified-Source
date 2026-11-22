#!/usr/bin/env node
// Help-mode targets ("<doc>.<section>") must resolve to a page in
// src/docs/user/en/** and, when a section is given, to a heading there
// (by text or a `<!-- slug -->` anchor) — HelpOverlay.extractSection() rules.
// A miss silently opens the whole page, so check them all here.
//   node scripts/check-help-targets.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

const docs = new Map();
for (const f of walk("src/docs/user/en")) if (f.endsWith(".md")) docs.set(basename(f, ".md"), readFileSync(f, "utf8"));

const norm = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
function resolves(target) {
  const [doc, section] = target.split(".");
  const md = docs.get(doc);
  if (md == null) return `no doc "${doc}"`;
  if (!section) return null;
  const anchors = [...md.matchAll(/^<!--\s*([\w-]+)\s*-->\s*$/gm)].map((m) => m[1].toLowerCase());
  const headings = [...md.matchAll(/^#{1,6}\s+(.*?)\s*$/gm)].map((m) => norm(m[1]));
  if (anchors.includes(section.toLowerCase()) || headings.includes(norm(section.replace(/_/g, " ")))) return null;
  return `no section "${section}" in ${doc}.md`;
}

const targets = []; // [file, target]
for (const f of walk("src").concat(walk("packages/spa-core/src"), walk("packages/spa-ui/src"))) {
  if (!/\.tsx?$/.test(f)) continue;
  const src = readFileSync(f, "utf8");
  for (const re of [/helpable\(\(\) => "([^"]+)"\)/g, /\bhelpTarget[=:]\s*"([^"]+)"/g, /\bhelp="([^"]+)"/g])
    for (const m of src.matchAll(re)) targets.push([f, m[1]]);
  // Widgets without a helpTarget fall back to widgets.<id>.
  if (/modules\/[^/]+\/index\.ts$/.test(f) || f.endsWith("shared/slots.ts")) {
    // A widget object: `{`, any comment lines, then `id: "…"`.
    const head = /\{\s*\n(?:\s*\/\/[^\n]*\n)*\s*id:\s*"([^"]+)"/;
    for (const block of src.split(new RegExp(`\\n(?=\\s*${head.source})`))) {
      const id = block.match(head)?.[1];
      if (id && /\bloader:/.test(block) && !/helpTarget:/.test(block)) targets.push([f, `widgets.${id.replace(/\./g, "_")}`]);
    }
  }
}

// SubPageLayout `help={(p) => `<doc>.${p}`}`: every section path of its list.
for (const [doc, file] of [["settings", "src/modules/settings/index.ts"], ["admin", "src/modules/admin/index.ts"], ["connections", "src/modules/directory/index.ts"]])
  for (const m of readFileSync(file, "utf8").matchAll(/\bpath:\s*"([\w-]+)"/g)) targets.push([file, `${doc}.${m[1]}`]);

let bad = 0;
for (const [f, t] of targets) {
  if (t.includes("${")) continue;
  const err = resolves(t);
  if (err) { bad++; console.log(`${f}: ${t} — ${err}`); }
}
console.log(`${targets.length} targets, ${bad} broken`);
process.exit(bad ? 1 : 0);
