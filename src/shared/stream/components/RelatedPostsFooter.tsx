// A quiet "Related posts" strip under an opened post (PostDetailModal: modal,
// docked and full view). Same ranking as the post.related sidebar widget —
// shared hashtags/categories — but three one-line links, and nothing at all
// when nothing relates. /display/ links open as a nested post in the modal.
import { For, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { bbcodeExcerpt } from "@utsukta/spa-core/lib/bbcode";
import { Avatar } from "@ui/Avatar";
import { fetchRelated } from "./RelatedItemsWidget";

export default function RelatedPostsFooter(props: { uuid: string }) {
  const { t } = useI18n();
  const [related] = createQueryResource(
    "stream-related-footer",
    () => ({ type: "posts" as const, item: props.uuid, limit: 3 }),
    fetchRelated,
  );

  return (
    <Show when={related()?.length}>
      <nav aria-label={t("widgets.related_footer")} class="mt-4 pt-3 border-t border-rim">
        <p class="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
          {t("widgets.related_footer")}
        </p>
        <ul class="space-y-0.5">
          <For each={related()}>
            {(p) => (
              <li>
                <a
                  href={`/display/${p.uuid}`}
                  class="flex items-center gap-2 -mx-2 px-2 py-1 rounded-lg text-sm text-txt hover:bg-elevated transition-colors"
                >
                  <Avatar src={p.authorAvatar} name={p.authorName} size={5} />
                  <span class="min-w-0 flex-1 truncate">{p.title || bbcodeExcerpt(p.body, 90)}</span>
                </a>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </Show>
  );
}
