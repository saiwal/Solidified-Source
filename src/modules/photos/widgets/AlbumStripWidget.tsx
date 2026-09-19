// Photo album strip (config: { album }): the album's latest thumbnails in a
// small grid, linking into the gallery. multiInstance.

import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchPhotoAlbum } from "../api/api";
import { variantSrc } from "../api/api";

const MAX_THUMBS = 6;

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <div class="bg-surface border border-rim rounded-xl px-4 py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </div>
    </Show>
  );
}

export default function AlbumStripWidget(props: WidgetProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const album = () => String(props.config?.album ?? "");

  const [data] = createQueryResource(
    "photo-album",
    () => (nick() && album() ? { nick: nick(), album: album() } : null),
    (p) => fetchPhotoAlbum(p.nick, p.album),
  );

  return (
    <Show when={album()} fallback={<EditHint text={t("widgets.not_configured")} />}>
      <Show when={data.loading}>
        <div class="bg-surface border border-rim rounded-xl p-3 animate-pulse">
          <div class="h-3 bg-elevated rounded w-1/2 mb-2" />
          <div class="grid grid-cols-3 gap-1">
            <For each={Array.from({ length: 6 })}>
              {() => <div class="aspect-square bg-elevated rounded" />}
            </For>
          </div>
        </div>
      </Show>

      <Show when={!data.loading}>
        <Show
          when={(data()?.photos.length ?? 0) > 0}
          fallback={<EditHint text={t("widgets.item_unavailable")} />}
        >
          <div class="bg-surface border border-rim rounded-xl overflow-hidden">
            <div class="px-4 py-3">
              <h3 class="text-sm font-semibold text-txt truncate">
                {data()!.album_name || t("widgets.album_strip")}
              </h3>
            </div>
            <div class="p-2 grid grid-cols-3 gap-1">
              <For each={data()!.photos.slice(0, MAX_THUMBS)}>
                {(photo) => (
                  <A
                    href={`/photos/${nick()}/image/${photo.resource_id}`}
                    class="relative block aspect-square overflow-hidden rounded"
                  >
                    <img
                      src={variantSrc(photo.src, 3)}
                      alt={photo.title || photo.filename}
                      class={`w-full h-full object-cover hover:opacity-80 transition-opacity
                             ${photo.is_nsfw ? 'blur-lg scale-110' : ''}`}
                      loading="lazy"
                    />
                    <Show when={photo.is_nsfw}>
                      <span class="absolute inset-0 flex items-center justify-center
                                   text-[0.5625rem] font-bold text-red-400 pointer-events-none">
                        {t("photos.nsfw")}
                      </span>
                    </Show>
                  </A>
                )}
              </For>
            </div>
            <A
              href={`/photos/${nick()}/album/${album()}`}
              class="block px-4 py-2 border-t border-rim text-center text-xs font-medium
                     text-accent hover:bg-elevated transition-colors"
            >
              {t("widgets.view_album")}
            </A>
          </div>
        </Show>
      </Show>
    </Show>
  );
}
