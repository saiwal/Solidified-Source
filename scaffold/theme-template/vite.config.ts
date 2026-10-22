import { defineConfig, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import solid from "vite-plugin-solid";
import path from "path";
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { THEME_SLUG, ASSET_WEB_PATH, BUILD_OUT_DIR_REL } from "./theme.config.mjs";
import { uiShadow } from "@utsukta/spa-ui/vite-plugin";

const OUT_DIR = path.resolve(__dirname, BUILD_OUT_DIR_REL);

/**
 * Post-processes the PHP files vite-plugin-static-copy just wrote (theme.php,
 * manifest.php, mod/spa.php, hooks/webpush.php) so the "__THEME_SLUG__"
 * literals baked into function names / asset paths track THEME_SLUG instead.
 * Copied from hubzilla-spa's own vite.config.ts — see that file's comment
 * for why this isn't a shared spa-core export (per-theme build config is
 * expected to be copied, not imported).
 *
 * Does NOT touch the deployed `spa-core/` folder — that's the shared
 * utsukta/spa-core package (namespace `Utsukta\SpaCore\...`), identical
 * across every theme, never slug-specific.
 */
function templateThemeSlug(): Plugin {
  const slugLower = THEME_SLUG.toLowerCase();
  const slugPascal = slugLower.charAt(0).toUpperCase() + slugLower.slice(1);
  const dirs = ["php", "mod", "hooks"];

  function walk(dir: string, out: string[]) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".php")) out.push(full);
    }
  }

  return {
    name: "template-theme-slug",
    closeBundle() {
      const files: string[] = [];
      for (const d of dirs) {
        const full = path.join(OUT_DIR, "..", d);
        try {
          walk(full, files);
        } catch {
          // dir not copied (e.g. partial build) — skip
        }
      }
      for (const file of files) {
        const content = readFileSync(file, "utf-8");
        const replaced = content
          .replaceAll("__THEME_SLUG__", slugLower)
          .replaceAll("__THEME_SLUG_PASCAL__", slugPascal);
        if (replaced !== content) writeFileSync(file, replaced);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    uiShadow({ themeUiDir: path.resolve(__dirname, "src/ui") }),
    solid(),
    viteStaticCopy({
      targets: [
        { src: "src/mod", dest: "../" },
        { src: "src/php", dest: "../" },
        { src: "src/hooks", dest: "../" },
        { src: "src/composer.json", dest: "../" },
        // Shared Router/Handlers — deployed alongside this theme so its composer.json's
        // path repository (utsukta/spa-core) can resolve via a same-directory relative path.
        { src: "../spa-core/php", dest: "../", rename: "spa-core" },
      ],
    }),
    templateThemeSlug(),
  ],
  define: {
    __THEME_SLUG__: JSON.stringify(THEME_SLUG),
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    cssCodeSplit: false,
    // .vite/manifest.json maps entry → hashed filenames; read by php/manifest.php
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: "app-[hash].js",
        chunkFileNames: "app-[name]-[hash].js",
        assetFileNames: (info) =>
          info.name?.endsWith(".css") ? "app-[hash].css" : "[name][extname]",
      },
    },
  },
  server: {
    proxy: {
      "/spa": { target: "https://hz-ddev.ddev.site", changeOrigin: true, secure: false },
      "/perfstats": { target: "https://hz-ddev.ddev.site", changeOrigin: true, secure: false },
      "/cloud": { target: "https://hz-ddev.ddev.site", changeOrigin: true, secure: false },
      "/photo": { target: "https://hz-ddev.ddev.site", changeOrigin: true, secure: false },
      "/attach": { target: "https://hz-ddev.ddev.site", changeOrigin: true, secure: false },
    },
  },
  base: ASSET_WEB_PATH + "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
