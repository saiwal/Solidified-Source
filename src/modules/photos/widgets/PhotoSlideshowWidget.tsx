// Random photo slideshow (config: { album, interval }): picks a random photo
// every `interval` seconds from one album or the whole channel. multiInstance.

import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { fetchPhotoAlbum, fetchPhotoSummary } from "../api/api";

export default function PhotoSlideshowWidget(props: WidgetProps) {
  const nick = usePageNick();
  const album = () => String(props.config?.album ?? "");
  const interval = () => Math.max(2, Number(props.config?.interval ?? 10)) * 1000;

  const [data] = createQueryResource(
    "photo-slideshow",
    () => (nick() ? { nick: nick(), album: album() } : null),
    async (p) =>
      p.album ? (await fetchPhotoAlbum(p.nick, p.album)).photos : await fetchPhotoSummary(p.nick),
  );

  const [idx, setIdx] = createSignal(0);
  const [paused, setPaused] = createSignal(false);
  const photos = () => data() ?? [];
  const current = () => photos()[idx() % Math.max(1, photos().length)];

  createEffect(() => {
    const n = photos().length;
    if (n < 2 || paused()) return;
    const id = setInterval(() => setIdx(Math.floor(Math.random() * n)), interval());
    onCleanup(() => clearInterval(id));
  });

  return (
    <Show when={current()}>
      {(photo) => (
        <div
          class="bg-surface border border-rim rounded-xl overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusIn={() => setPaused(true)}
          onFocusOut={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
          onTouchCancel={() => setPaused(false)}
        >
          <A href={`/photos/${nick()}/image/${photo().resource_id}`} class="block">
            <img
              src={photo().src}
              alt={photo().title || photo().filename}
              class={`w-full aspect-square object-contain bg-elevated transition-opacity duration-500
                     ${photo().is_nsfw ? "blur-lg scale-110" : ""}`}
              loading="lazy"
            />
          </A>
          <Show when={photo().title}>
            <p class="px-3 py-2 text-xs text-muted truncate">{photo().title}</p>
          </Show>
        </div>
      )}
    </Show>
  );
}
