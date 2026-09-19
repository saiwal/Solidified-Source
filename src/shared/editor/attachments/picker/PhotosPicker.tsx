import {
  createSignal,
  Show,
  For,
  type Component,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchAlbums, fetchPhotoAlbum } from "@/modules/photos/api/api";
import type { Photo, Album } from "@/modules/photos/api/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineCheck, MdOutlineImage, MdOutlineSentiment_dissatisfied } from "solid-icons/md";

interface Props {
  nick: string;
  selected: () => Set<string>;
  onToggle: (photo: Photo) => void;
}

const PhotosPicker: Component<Props> = (props) => {
  const { t } = useI18n();
  const [currentAlbum, setCurrentAlbum] = createSignal<Album | null>(null);

  const [albums] = createQueryResource("photo-albums", () => props.nick, fetchAlbums);

  const [albumPhotos] = createQueryResource(
    "photo-album",
    () => {
      const a = currentAlbum();
      return a ? { nick: props.nick, folder: a.folder } : null;
    },
    (p) => fetchPhotoAlbum(p.nick, p.folder),
  );

  return (
    <div class="flex flex-col h-full min-h-0">
      {/* Breadcrumb */}
      <div class="flex items-center gap-1.5 px-1 pb-3 text-sm">
        <button
          type="button"
          onClick={() => setCurrentAlbum(null)}
          class={
            "hover:text-txt transition-colors " +
            (currentAlbum() ? "text-accent" : "text-txt font-medium")
          }
        >
          {t("editor.photos_root")}
        </button>
        <Show when={currentAlbum()}>
          <span class="text-muted">/</span>
          <span class="text-txt font-medium truncate">{currentAlbum()!.album}</span>
        </Show>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto min-h-0">
        <Show when={!currentAlbum()}>
          {/* Albums grid */}
          <Show
            when={!albums.loading}
            fallback={<GridSkeleton count={6} />}
          >
            <Show
              when={(albums() ?? []).length > 0}
              fallback={<EmptyState label={t("editor.no_albums")} />}
            >
              <div class="grid grid-cols-3 gap-2">
                <For each={albums()}>
                  {(album) => (
                    <button
                      type="button"
                      onClick={() => setCurrentAlbum(album)}
                      class="flex flex-col rounded-lg overflow-hidden border border-rim
                             hover:border-accent/60 transition-colors bg-surface group"
                    >
                      <div class="aspect-square bg-elevated overflow-hidden">
                        <Show
                          when={album.thumb}
                          fallback={<AlbumPlaceholder />}
                        >
                          <img
                            src={album.thumb!}
                            alt={album.album}
                            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </Show>
                      </div>
                      <div class="px-2 py-1.5 text-left">
                        <p class="text-xs font-medium text-txt truncate">{album.album}</p>
                        <p class="text-[0.625rem] text-muted">{t("editor.photo_count", { count: album.total })}</p>
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </Show>

        <Show when={currentAlbum()}>
          {/* Photos in album */}
          <Show
            when={!albumPhotos.loading}
            fallback={<GridSkeleton count={9} />}
          >
            <Show
              when={(albumPhotos()?.photos ?? []).length > 0}
              fallback={<EmptyState label={t("editor.no_album_photos")} />}
            >
              <div class="grid grid-cols-3 gap-2">
                <For each={albumPhotos()?.photos ?? []}>
                  {(photo) => {
                    const isSelected = () => props.selected().has(photo.resource_id);
                    return (
                      <button
                        type="button"
                        onClick={() => props.onToggle(photo)}
                        class={
                          "relative aspect-square rounded-lg overflow-hidden border-2 transition-all " +
                          (isSelected()
                            ? "border-accent shadow-md shadow-accent/20 scale-[0.97]"
                            : "border-transparent hover:border-rim")
                        }
                      >
                        <img
                          src={photo.src}
                          alt={photo.filename}
                          class="w-full h-full object-cover"
                        />
                        <Show when={isSelected()}>
                          <div class="absolute inset-0 bg-accent/20 flex items-center justify-center">
                            <div class="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                              <MdOutlineCheck class="w-3.5 h-3.5 text-accent-fg" />
                            </div>
                          </div>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default PhotosPicker;

// ── Helpers ───────────────────────────────────────────────────────────────────

function GridSkeleton(props: { count: number }) {
  return (
    <div class="grid grid-cols-3 gap-2">
      <For each={Array.from({ length: props.count })}>
        {() => (
          <div class="aspect-square rounded-lg bg-elevated animate-pulse" />
        )}
      </For>
    </div>
  );
}

function AlbumPlaceholder() {
  return (
    <div class="w-full h-full flex items-center justify-center bg-elevated">
      <MdOutlineImage class="w-8 h-8 text-muted" />
    </div>
  );
}

function EmptyState(props: { label: string }) {
  return (
    <div class="flex flex-col items-center justify-center py-12 text-muted">
      <MdOutlineSentiment_dissatisfied class="w-10 h-10 mb-2 opacity-40" />
      <p class="text-sm">{props.label}</p>
    </div>
  );
}
