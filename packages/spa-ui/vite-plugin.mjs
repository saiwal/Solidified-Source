// @ui file shadowing. `@ui/<Name>` resolves to the theme's own src/ui/<Name>.tsx
// when that file exists, and to this package's default implementation
// otherwise — so a theme overrides one primitive without forking the rest.
// `@ui-base/<Name>` always resolves here, for an override that wraps the
// default instead of replacing it.
//
// The defaults import each other through `@ui/…` too, so an overridden
// Button is also the one inside Modal's header and Menu's trigger.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const UI_BASE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "src");
const EXTS = [".tsx", ".ts"];

function find(dir, name) {
  for (const ext of EXTS) {
    const p = path.join(dir, name + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

/** @param {{ themeUiDir: string }} opts absolute path of the theme's src/ui */
export function uiShadow({ themeUiDir }) {
  return {
    name: "ui-shadow",
    enforce: "pre",
    resolveId(id) {
      if (id.startsWith("@ui-base/")) return find(UI_BASE_DIR, id.slice(9));
      if (id.startsWith("@ui/")) {
        const name = id.slice(4);
        return find(themeUiDir, name) ?? find(UI_BASE_DIR, name);
      }
    },
    // Adding or deleting an override changes what an import resolves to, which
    // the dev server's module graph won't notice on its own.
    configureServer(server) {
      server.watcher.add(themeUiDir);
      const changed = (file) => { if (file.startsWith(themeUiDir + path.sep)) server.restart(); };
      server.watcher.on("add", changed);
      server.watcher.on("unlink", changed);
    },
  };
}
