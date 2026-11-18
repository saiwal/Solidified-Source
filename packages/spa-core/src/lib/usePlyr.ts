import type Plyr from 'plyr';
import { onCleanup, createEffect } from "solid-js";

const PLYR_OPTIONS: Plyr.Options = {
  controls: [
    'play', 'progress', 'current-time', 'mute', 'volume',
    'captions', 'settings', 'pip', 'download', 'fullscreen',
  ],
  youtube: { noCookie: true, rel: 0, showinfo: 0, iv_load_policy: 3 },
  vimeo: { byline: false, portrait: false, title: false, speed: true },
  resetOnEnd: true,
  tooltips: { controls: false, seek: true },
  iconUrl: import.meta.env.BASE_URL + 'plyr.svg',
  loadSprite: true,
};

// Chrome ignores the `download` attribute on cross-origin anchors.
// After Plyr creates its download button, intercept clicks: fetch the file as
// a blob and trigger a save via an object URL. Falls back to window.open if
// the server blocks CORS or the fetch fails for any other reason.
function patchDownloadButton(plyrContainer: Element): void {
  const btn = plyrContainer.querySelector<HTMLAnchorElement>('[data-plyr="download"]');
  if (!btn) return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    const url = btn.href;
    if (!url) return;

    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const filename = new URL(url).pathname.split('/').pop() || 'download';
      const a = Object.assign(document.createElement('a'), {
        href: objUrl,
        download: filename,
        style: 'display:none',
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objUrl), 10_000);
    } catch {
      // Server blocks CORS or fetch failed — open in new tab as last resort
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  });
}

// Single-element variant for a video/audio node whose ref is known directly
// (e.g. a preview modal), rather than scanning a rendered-body container.
// Returns a dispose function — call it from onCleanup at the ref call site.
export function mountPlyr(el: HTMLMediaElement): () => void {
  let player: Plyr | null = null;
  let disposed = false;

  import('plyr').then(({ default: PlyrCtor }) => {
    if (disposed || !el.isConnected) return;
    try {
      player = new PlyrCtor(el, PLYR_OPTIONS);
      player.on('error', () => {});
      player.on('ready', () => {
        const container = el.closest('.plyr');
        if (container) patchDownloadButton(container);
      });
    } catch (_) {
      player = null;
    }
  });

  return () => {
    disposed = true;
    try { player?.destroy(); } catch (_) {}
  };
}

export function usePlyr(
  containerRef: () => HTMLElement | undefined,
  body: () => string,
) {
  let instances: Plyr[] = [];

  createEffect(() => [body(), containerRef()] as const, ([, el]) => {
    const cleanups: (() => void)[] = [];

    instances.forEach(p => { try { p.destroy(); } catch (_) {} });
    instances = [];

    if (!el) return;

    const hasMedia =
      el.querySelector('video, audio, [data-plyr-provider]') !== null;
    if (!hasMedia) return;

    // `active` guards against a stale .then() firing after the effect re-runs
    // or the component unmounts before the async import resolves.
    let active = true;
    cleanups.push(() => {
      active = false;
      instances.forEach(p => { try { p.destroy(); } catch (_) {} });
      instances = [];
    });

    import('plyr').then(({ default: PlyrCtor }) => {
      if (!active || !el.isConnected) return;

      const init = (target: HTMLMediaElement | HTMLElement): Plyr | null => {
        try {
          const player = new PlyrCtor(target, PLYR_OPTIONS);
          player.on('error', () => {});
          player.on('ready', () => {
            const container = target.closest('.plyr');
            if (container) patchDownloadButton(container);
          });
          return player;
        } catch (_) {
          return null;
        }
      };

      el.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => {
        const p = init(media);
        if (p) instances.push(p);
      });
      el.querySelectorAll<HTMLElement>('[data-plyr-provider]').forEach(embed => {
        const p = init(embed);
        if (p) instances.push(p);
      });
    });
    return () => cleanups.forEach((f) => f());
  });
}

/** Ref factory: `ref={plyrRef()}` — mounts Plyr, tears it down with the owner
 *  that called it (Solid 2 ref callbacks have none of their own). */
export function plyrRef() {
  let off: (() => void) | undefined;
  onCleanup(() => off?.());
  return (el: HTMLMediaElement) => { off = mountPlyr(el); };
}
