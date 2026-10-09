import { Show } from "solid-js";
import { MdFillNew_releases } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";

// Marks a post the viewer hasn't seen yet — shared by every feed view.
export function UnseenBadge(props: { post: ThreadNode; size?: number; class?: string }) {
  const { t } = useI18n();
  return (
    <Show when={props.post.flags.includes("unseen")}>
      <MdFillNew_releases size={props.size ?? 16} class={`shrink-0 text-accent ${props.class ?? ""}`}
        title={t("post.new_badge")} aria-label={t("post.new_badge")} />
    </Show>
  );
}
