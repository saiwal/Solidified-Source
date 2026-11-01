#!/usr/bin/env node
// Scaffolds packages/theme-<slug>/ from scaffold/theme-template/, substituting
// __THEME_SLUG__ / __THEME_SLUG_PASCAL__ placeholders in every copied file.
// Usage: node scripts/create-theme.mjs <slug>
import { readdirSync, statSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_DIR = path.join(REPO_ROOT, "scaffold", "theme-template");

const slug = process.argv[2];

if (!slug) {
  console.error("Usage: node scripts/create-theme.mjs <slug>");
  process.exit(1);
}

// Must be a valid PHP identifier fragment — the slug is embedded directly in
// generated PHP function names ({slug}_init(), {slug}_assets(), etc), which
// can't contain hyphens/underscores at the boundary safely. Keep it simple:
// lowercase letters and digits, starting with a letter.
if (!/^[a-z][a-z0-9]*$/.test(slug)) {
  console.error(`Invalid slug "${slug}" — use lowercase letters/digits only, starting with a letter (e.g. "adminlte").`);
  process.exit(1);
}

const destDir = path.join(REPO_ROOT, "packages", `theme-${slug}`);
if (statSyncSafe(destDir)) {
  console.error(`${path.relative(REPO_ROOT, destDir)} already exists.`);
  process.exit(1);
}

const slugPascal = slug.charAt(0).toUpperCase() + slug.slice(1);
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2"]);

function statSyncSafe(p) {
  try { return statSync(p); } catch { return null; }
}

function copyTemplate(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);
    const dstPath = path.join(dstDir, entry);
    if (statSync(srcPath).isDirectory()) {
      copyTemplate(srcPath, dstPath);
      continue;
    }
    if (BINARY_EXT.has(path.extname(entry))) {
      writeFileSync(dstPath, readFileSync(srcPath));
      continue;
    }
    const content = readFileSync(srcPath, "utf-8")
      .replaceAll("__THEME_SLUG_PASCAL__", slugPascal)
      .replaceAll("__THEME_SLUG__", slug);
    writeFileSync(dstPath, content);
  }
}

copyTemplate(TEMPLATE_DIR, destDir);

const rel = path.relative(REPO_ROOT, destDir);
console.log(`Created ${rel}/`);
console.log(`
Next steps:
  1. npm install                       # links @utsukta/spa-core + this new workspace member
  2. cd ${rel}
  3. npm run build                     # verify the toolchain wires up
  4. Add your own public/ assets (favicon, touch icons — see index.html)
  5. Rebrand src/styles/theme.css and src/styles/fonts.css
  6. Rewrite src/Layout.tsx and src/shared/views/{NavItem,Slot}.tsx's markup
     for your CSS framework — they already call the same
     @utsukta/spa-core/lib/useLayoutChrome() hook solidified uses
  7. Add modules under src/modules/<id>/ as you build out views

See src/docs/dev/en/5-extending/theme-scaffold.md for the full walkthrough.
`);
