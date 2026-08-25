/// <reference types="vite/client" />

declare module "virtual:public-listing/*" {
  const files: string[];
  export default files;
}

/** Injected via vite.config.ts `define`, sourced from theme.config.mjs. */
declare const __THEME_SLUG__: string;
declare const __THEME_VERSION__: string;
