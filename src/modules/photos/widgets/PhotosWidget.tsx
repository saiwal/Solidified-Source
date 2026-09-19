import { createEffect, createMemo, Show, For, onCleanup } from "solid-js";
import { A, useParams } from "@solidjs/router";
import { MdFillPhoto_library, MdFillImage } from "solid-icons/md";
import {
  recentPhotos, albums, albumsLoading,
  loadRecentPhotos, loadAlbums,
} from "../store/store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { variantSrc } from "../api/api";
import PhotoSwipe from "photoswipe";
import "photoswipe/style.css";

// Sidebar is tall but shared — past this the widget crowds out everything
// below it, and "See all" takes over.
const ALBUM_LIMIT = 12;

export default function PhotosWidget() {
  const params = useParams<{ nick?: string }>();
  const { t } = useI18n();
  const nick = () => params.nick ?? '';
  // Same split the /photos Albums tab makes: the automatic upload folders
  // (Photos.php::autoAlbumRegex) are noise in a 6-slot sidebar widget — they
  // live in their own tab, which "See all" links to.
  const manualAlbums = createMemo(() => albums().filter(a => !a.auto));
  let pswpRef: PhotoSwipe | null = null;

  onCleanup(() => { pswpRef?.close(); });

  createEffect(() => {
    if (!nick()) return;
    loadRecentPhotos(nick());
    loadAlbums(nick());
  });

  function openLightbox(startIndex: number) {
    pswpRef?.close();
    const list = recentPhotos();
    const items = list.map(p => ({
      src:         variantSrc(p.src, 2),
      msrc:        variantSrc(p.src, 3),
      alt:         p.filename,
      width:       0,
      height:      0,
      resource_id: p.resource_id,
    }));

    const pswp = new PhotoSwipe({
      dataSource: items,
      index: startIndex,
      bgOpacity: 0.95,
      wheelToZoom: true,
    });

    pswp.on('loadComplete', (e) => {
      const { slide, content } = e;
      const img = content.element;
      if (!(img instanceof HTMLImageElement)) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) return;
      items[slide.index].width  = w;
      items[slide.index].height = h;
      (content as any).width   = w;
      (content as any).height  = h;
      const wasAtInitial = slide.currZoomLevel === slide.zoomLevels.initial;
      (slide as any).width  = w;
      (slide as any).height = h;
      slide.calculateSize();
      slide.updateContentSize(true);
      if (wasAtInitial) slide.zoomTo(slide.zoomLevels.initial, undefined, 0);
    });

    pswp.on('uiRegister', () => {
      pswp.ui?.registerElement({
        name: 'details-link',
        order: 8,
        isButton: false,
        tagName: 'div',
        onInit: (el: HTMLElement) => {
          el.style.cssText = 'display:flex;align-items:center;padding:0 4px;';
          const link = document.createElement('a');
          link.title = t('photos.view_details');
          link.style.cssText =
            'display:flex;align-items:center;opacity:0.75;color:white;padding:2px 4px;';
          link.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="white">' +
            '<path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';
          const setHref = () => {
            const photo = list[pswp.currIndex];
            if (photo?.resource_id)
              link.href = `/photos/${nick()}/image/${photo.resource_id}`;
          };
          setHref();
          pswp.on('change', setHref);
          el.appendChild(link);
        },
      });
    });

    pswp.on('close', () => { pswpRef = null; });
    pswpRef = pswp;
    pswp.init();
  }

  return (
    <div class="space-y-4">

      {/* Recent photos strip */}
      <Show when={recentPhotos().length > 0}>
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1">
              <MdFillImage size={13} /> {t("photos.recent")}
            </span>
            <A
              href={`/photos/${nick()}`}
              class="text-xs text-accent hover:underline"
            >
              {t("photos.see_all")}
            </A>
          </div>
          <div class="grid grid-cols-4 gap-1">
            <For each={recentPhotos().slice(0, 8)}>
              {(photo, index) => (
                <button
                  onClick={() => openLightbox(index())}
                  class="relative aspect-square rounded-lg overflow-hidden bg-surface block cursor-pointer"
                >
                  <img
                    src={variantSrc(photo.src, 3)}
                    alt={photo.filename}
                    loading="lazy"
                    class={`w-full h-full object-cover ${photo.is_nsfw
                      ? 'blur-lg scale-110'
                      : 'hover:scale-105 transition-transform duration-200'}`}
                  />
                  <Show when={photo.is_nsfw}>
                    <span class="absolute inset-0 flex items-center justify-center
                                 text-[0.5625rem] font-bold text-red-400 pointer-events-none">
                      {t("photos.nsfw")}
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Album list */}
      <Show when={!albumsLoading() && manualAlbums().length > 0}>
        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1">
              <MdFillPhoto_library size={13} /> {t("photos.albums")}
            </span>
            <Show when={manualAlbums().length > ALBUM_LIMIT}>
              <A href={`/photos/${nick()}`} class="text-xs text-accent hover:underline">
                {t("photos.see_all")}
              </A>
            </Show>
          </div>
          {/* Compact rows, not cards: a square-thumb grid fit 6 albums in the
              height these fit ~12, and it matches the loading skeleton below. */}
          <div class="flex flex-col">
            <For each={manualAlbums().slice(0, ALBUM_LIMIT)}>
              {(album) => (
                <A
                  href={`/photos/${nick()}/album/${album.folder}`}
                  class="group flex items-center gap-2.5 p-1.5 rounded-lg
                         hover:bg-surface transition-colors"
                >
                  <div class="w-9 h-9 rounded-md overflow-hidden bg-overlay shrink-0">
                    <Show
                      when={album.thumb}
                      fallback={
                        <div class="w-full h-full flex items-center justify-center">
                          <MdFillPhoto_library size={16} class="text-subtle" />
                        </div>
                      }
                    >
                      <img
                        src={album.thumb!}
                        alt={album.album}
                        loading="lazy"
                        class="w-full h-full object-cover"
                      />
                    </Show>
                  </div>
                  <p class="flex-1 min-w-0 text-xs font-medium text-txt truncate
                            group-hover:text-accent transition-colors">
                    {album.album}
                  </p>
                  <span class="text-xs text-muted shrink-0">{album.total}</span>
                </A>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={albumsLoading()}>
        <div class="space-y-2">
          <For each={Array(3).fill(0)}>
            {() => (
              <div class="flex items-center gap-2.5 p-2">
                <div class="w-9 h-9 rounded-md bg-surface animate-pulse shrink-0" />
                <div class="flex-1 space-y-1">
                  <div class="h-3 bg-surface rounded animate-pulse w-3/4" />
                  <div class="h-2.5 bg-elevated rounded animate-pulse w-1/4" />
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

    </div>
  );
}
