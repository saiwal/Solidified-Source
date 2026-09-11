import { render } from "solid-js/web";
import "./index.css";
import App from "./App";
import { loadTypography } from "@utsukta/spa-core/lib/typography";
import { loadBackground } from "@utsukta/spa-core/lib/background";
import { loadCornerRadius } from "@utsukta/spa-core/lib/corner-radius";
import { applyTheme } from "@utsukta/spa-core/lib/useTheme";
import { installOfflineFallback } from "@utsukta/spa-core/lib/offline-fallback";
import type { ThemeId } from "@utsukta/spa-core/types/theme.types";

// Before anything can issue a request.
installOfflineFallback();

// Core rewrites /@nick and /~nick to channel/nick server-side (boot.php
// App::init), but only internally — the browser URL keeps the short form, which
// no route matches. Mirror the rewrite here, before the router reads
// window.location, so usePageNick() and moduleIdForPath() — both of which parse
// the pathname — see the one canonical shape.
const handle = location.pathname.match(/^\/[@~]([^/]+)(\/.*)?$/);
if (handle) {
  history.replaceState(
    null,
    "",
    `/channel/${handle[1]}${handle[2] ?? ""}${location.search}${location.hash}`,
  );
}


// applyTheme, not a bare data-theme attribute: "custom" has no stylesheet rule
// of its own, so it needs its <style> injected here or the page paints with the
// light defaults until the settings fetch lands.
applyTheme((localStorage.getItem("hz-theme") as ThemeId) ?? "light");

loadTypography();
loadBackground();
loadCornerRadius();

render(() => <App />, document.getElementById("root")!);
