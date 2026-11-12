import type { Plugin } from "vite";
export declare const UI_BASE_DIR: string;
export declare function uiShadow(opts: { themeUiDir: string }): Plugin;
export declare function srcShadow(opts: { base: string; overlay: string }): Plugin;
