// src/modules/files/widgets/CloudBookmarksWidget.tsx
import { For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { MdOutlineBookmark_border, MdOutlineDelete } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useCloudBookmarks } from "../bookmarks";

/** Bookmarks pointing into a /cloud/ — folders open in the file view, files preview.
 *  Renders nothing until there is at least one, so an empty sidebar slot (or one
 *  still loading) takes no space. */
export default function CloudBookmarksWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const bm = useCloudBookmarks();

  // The path part, under the title, so two "Documents" can be told apart.
  const where = (path: string) => path.replace(/^\/cloud\//, "");

  return (
    <Show when={bm.enabled() && bm.list().length > 0}>
      <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden">
        <div class="px-4 pt-3.5 pb-3 flex items-center gap-2">
          <MdOutlineBookmark_border class="w-4 h-4 text-accent shrink-0" />
          <h3 class="text-sm font-semibold text-txt flex-1">{t("files_mod.bookmarked_files")}</h3>
          <span class="text-xs text-muted tabular-nums">{bm.list().length}</span>
        </div>

        <div class="divide-y divide-rim">
          <For each={bm.list()}>
            {(b) => (
              <div class="flex items-center gap-2 px-3 py-2.5 hover:bg-elevated group transition-colors">
                <button
                  class="flex-1 min-w-0 text-left hover:text-accent transition-colors"
                  onClick={() => navigate(b.path.split("/").map(encodeURIComponent).join("/"))}
                >
                  <span class="block text-xs text-txt truncate">{b.title}</span>
                  <span class="block text-[0.6875rem] text-muted truncate">{where(b.path)}</span>
                </button>
                <button
                  onClick={() => void bm.remove(b.id)}
                  class="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 rounded text-muted hover:text-red-500 transition-all shrink-0"
                  title={t("files_mod.unbookmark") as string}
                  aria-label={t("files_mod.unbookmark") as string}
                >
                  <MdOutlineDelete class="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
