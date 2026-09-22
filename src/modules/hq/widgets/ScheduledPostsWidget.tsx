import { createSignal, For, Show, onMount } from "solid-js";
import { MdOutlineSchedule } from "solid-icons/md";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { ComposerKindIcon } from "@/shared/editor/components/ComposerModal";

import { openPost } from "@/shared/views/modal-host";

type ScheduledPost = {
  iid: number;
  uuid: string;
  mid: string;
  title: string;
  body: string;
  created: string; // UTC publish time
  /** item_private = 2 — a direct message rather than a wall post. */
  dm?: boolean;
};

function makePreview(body: string): string {
  return body
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function publishAt(created: string): string {
  return new Date(created.replace(" ", "T") + "Z").toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Delayed-publish queue (composer "publish at" posts, item_delayed = 1).
 * Renders nothing at all when the queue is empty — the widget only appears
 * while there is something scheduled.
 */
export default function ScheduledPostsWidget() {
  const { t } = useI18n();
  const [posts, setPosts] = createSignal<ScheduledPost[]>([]);
  const [busy, setBusy] = createSignal<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch("/spa/scheduled");
      if (!res.ok) return;
      const json = (await res.json()) as { data?: ScheduledPost[] };
      setPosts(json.data ?? []);
    } catch {
      /* stay hidden */
    }
  }

  onMount(load);

  async function act(uuid: string, action: "publish" | "delete") {
    setBusy(uuid);
    try {
      const res = await apiFetch(`/spa/scheduled/${action}`, {
        method: "POST",
        body: JSON.stringify({ uuid }),
      });
      if (res.ok) setPosts((p) => p.filter((x) => x.uuid !== uuid));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Show when={posts().length > 0}>
      <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div class="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between">
          <span class="text-xs font-medium uppercase tracking-wider text-muted">
            {t("hq.scheduled")}
          </span>
          <span class="text-xs text-muted tabular-nums">{posts().length}</span>
        </div>

        <div class="divide-y divide-rim">
          <For each={posts()}>
            {(post) => (
              <div
                class="px-3.5 py-2.5 hover:bg-elevated transition-colors cursor-pointer"
                classList={{ "opacity-50 pointer-events-none": busy() === post.uuid }}
                onClick={() => openPost(post.uuid, { onClose: () => void load() })}
              >
                {/* The queue mixes wall posts and DMs — the same glyphs the
                    composer header and dock pills use, so a kind reads the same
                    wherever it appears. */}
                <div class="flex items-start gap-2">
                  <span
                    class="shrink-0 mt-0.5"
                    title={post.dm ? t("editor.dm_new_message") : t("editor.new_post")}
                  >
                    <ComposerKindIcon kind={post.dm ? "dm" : "post"} />
                  </span>
                  <div class="min-w-0 flex-1">
                    <Show when={post.title}>
                      <p class="text-xs font-medium text-txt truncate leading-snug">
                        {post.title}
                      </p>
                    </Show>
                    <p class="text-xs text-muted truncate">{makePreview(post.body)}</p>
                  </div>
                </div>

                <div class="flex items-center justify-between gap-2 mt-1.5">
                  <span class="flex items-center gap-1 text-[0.625rem] text-muted/70 truncate" title={t("hq.scheduled_for")}>
                    <MdOutlineSchedule size={11} class="shrink-0" />
                    {publishAt(post.created)}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void act(post.uuid, "publish"); }}
                      class="px-2 py-0.5 text-[0.625rem] rounded border border-rim text-muted
                             hover:text-txt hover:border-rim-strong transition-colors"
                    >
                      {t("hq.publish_now")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void act(post.uuid, "delete"); }}
                      class="px-2 py-0.5 text-[0.625rem] rounded border border-rim text-muted
                             hover:text-red-500 hover:border-red-400/50 transition-colors"
                    >
                      {t("hq.cancel_scheduled")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

    </Show>
  );
}
