// lib/useEmbeds.ts
//
// Turns the <a class="oembed-embed"> links bbcode.ts emits for [embed] into
// the provider's player (PeerTube, Dailymotion, …; YouTube/Vimeo are already
// Plyr divs by then and never reach this).
//
// Same two-step as useOsmMap: sanitizeHtml strips <iframe>, so the frame is
// built here as a DOM node after sanitising. /spa/oembed applies the hub's
// embed policy and hands back only an https src; a null src (not allowlisted,
// no oEmbed, offline) leaves the plain link standing.

import { createEffect, onCleanup } from "solid-js";

interface Embed { src: string | null; ratio?: number | null; title?: string }

// One lookup per URL per page load — a thread can repeat the same embed and
// the stream re-renders bodies freely.
const lookups = new Map<string, Promise<Embed | null>>();

function lookup(url: string): Promise<Embed | null> {
  let p = lookups.get(url);
  if (!p) {
    p = fetch(`/spa/oembed?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.data ?? null) as Embed | null)
      .catch(() => { lookups.delete(url); return null; });   // retry after a network blip
    lookups.set(url, p);
  }
  return p;
}

function buildFrame(e: Embed & { src: string }): HTMLElement {
  const frame = document.createElement("iframe");
  frame.src = e.src;
  frame.title = e.title || "Embedded media";
  frame.loading = "lazy";
  frame.allowFullscreen = true;
  frame.allow = "fullscreen; picture-in-picture; encrypted-media";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  // A player needs scripts and its own origin's storage; it does not get
  // top-navigation, forms or modal dialogs over the SPA.
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-presentation");
  frame.className = "w-full my-2 rounded border-0";
  frame.style.aspectRatio = String(e.ratio && e.ratio > 0.2 && e.ratio < 5 ? e.ratio : 16 / 9);
  return frame;
}

/** Shaped like usePlyr(ref, body) / useOsmMap(ref, body). */
export function useEmbeds(ref: () => HTMLElement | undefined, body: () => string): void {
  createEffect(() => {
    body();
    const el = ref();
    if (!el) return;
    const anchors = Array.from(el.querySelectorAll<HTMLAnchorElement>("a.oembed-embed"));
    if (!anchors.length) return;

    let active = true;
    onCleanup(() => { active = false; });

    for (const a of anchors) {
      lookup(a.href).then((e) => {
        if (active && e?.src && a.isConnected) a.replaceWith(buildFrame(e as Embed & { src: string }));
      });
    }
  });
}
