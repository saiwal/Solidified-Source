import { untrack } from "solid-js";
import { createSyncSignal } from "./syncSignal";

export type BgFit = "tile" | "cover";

// Sync: setBgUrl + setBgFit run back to back and each reads the other's
// value — a batched signal handed the second call the previous wallpaper.
const [bgUrl, setBgUrlSignal] = createSyncSignal(localStorage.getItem("hz-bg-url") ?? "");
const [bgFit, setBgFitSignal] = createSyncSignal<BgFit>(
  (localStorage.getItem("hz-bg-fit") as BgFit) ?? "cover"
);

// What is on screen right now — the viewer's own wallpaper or a visited
// channel's. A theme that draws a "cover" wallpaper as an <img> reads this
// (and hides its CSS layer under html[data-bg-fit="cover"]).
const [appliedBg, setAppliedBg] = createSyncSignal<{ url: string; fit: BgFit }>({ url: "", fit: "cover" });
export function useAppliedBg() { return appliedBg; }

export function useBgUrl() { return bgUrl; }
export function useBgFit() { return bgFit; }

/** Apply background CSS vars only — does NOT touch localStorage or signals. */
export function applyBackgroundCSS(url: string, fit: BgFit): void {
  const root = document.documentElement;
  const cur = untrack(appliedBg);
  if (cur.url !== url || cur.fit !== fit) setAppliedBg({ url, fit });
  if (url) root.dataset.bgFit = fit;
  else delete root.dataset.bgFit;
  if (url) {
    root.style.setProperty("--hz-bg-image",  `url(${JSON.stringify(url)})`);
    root.style.setProperty("--hz-bg-size",   fit === "tile" ? "auto"     : "cover");
    root.style.setProperty("--hz-bg-repeat", fit === "tile" ? "repeat"   : "no-repeat");
    root.style.setProperty("--hz-bg-pos",    fit === "tile" ? "top left" : "center center");
  } else {
    root.style.removeProperty("--hz-bg-image");
    root.style.removeProperty("--hz-bg-size");
    root.style.removeProperty("--hz-bg-repeat");
    root.style.removeProperty("--hz-bg-pos");
  }
}

export function applyBackground(url: string, fit: BgFit): void {
  applyBackgroundCSS(url, fit);
  localStorage.setItem("hz-bg-url", url);
  localStorage.setItem("hz-bg-fit", fit);
}

export function setBgUrl(url: string) {
  setBgUrlSignal(url);
  applyBackground(url, untrack(bgFit));
}

export function setBgFit(fit: BgFit) {
  setBgFitSignal(fit);
  applyBackground(untrack(bgUrl), fit);
}

export function loadBackground(): void {
  const url = localStorage.getItem("hz-bg-url") ?? "";
  const fit = (localStorage.getItem("hz-bg-fit") as BgFit) ?? "cover";
  setBgUrlSignal(url);
  setBgFitSignal(fit);
  applyBackground(url, fit);
}

/** Apply server-side values (both signals set atomically before DOM update). */
export function initBackground(url: string, fit: BgFit): void {
  setBgUrlSignal(url);
  setBgFitSignal(fit);
  applyBackground(url, fit);
}
