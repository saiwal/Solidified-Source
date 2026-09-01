// src/modules/moderate/views/ModerateView.tsx
import { For, Show, createSignal } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { renderBody } from "@utsukta/spa-core/lib/renderBody";
import {
  fetchModerationQueue,
  approveModerationItem,
  dropModerationItem,
  type PendingItem,
} from "../api";
import { refreshPendingModeration } from "../store";

function relativeTime(when?: string): string {
  if (!when) return "";
  const d = new Date(when.replace(" ", "T"));
  const diff = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type Translate = ReturnType<typeof useI18n>["t"];

function pendingLabel(item: PendingItem, t: Translate): string {
  if (item.verb === "Like") return t("moderate.requested_to_like");
  if (item.verb === "Dislike") return t("moderate.requested_to_dislike");
  if (item.verb === "Announce") return t("moderate.requested_to_repeat");
  if (item.is_reply) return t("moderate.wants_to_comment");
  return t("moderate.wants_to_post");
}

function PendingRow(props: { item: PendingItem; onResolved: (iid: number) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = createSignal(false);

  async function approve() {
    setBusy(true);
    await approveModerationItem(props.item.iid);
    props.onResolved(props.item.iid);
  }

  async function reject() {
    setBusy(true);
    await dropModerationItem(props.item.iid);
    props.onResolved(props.item.iid);
  }

  // Reactions/comments carry no body of their own — show what they're
  // reacting to/replying on instead. A top-level pending wall post shows
  // its own content since there is no separate target.
  const snippet = () => props.item.target?.body ?? props.item.body ?? "";
  const snippetMime = () =>
    props.item.target ? props.item.target.mimetype : props.item.mimetype;
  const snippetLink = () => props.item.target?.permalink;

  return (
    <div class="flex items-start gap-3 px-4 py-3">
      <Show when={props.item.author.photo?.src}>
        <img
          src={props.item.author.photo?.src}
          alt={props.item.author.name ?? ""}
          class="w-8 h-8 rounded-full shrink-0 object-cover"
        />
      </Show>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-txt leading-snug">
          <span class="font-semibold">{props.item.author.name} </span>
          <span class="text-muted">{pendingLabel(props.item, t)}</span>
        </p>
        <Show when={snippet()}>
          <a
            href={snippetLink() ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            class="block mt-1 text-xs text-muted line-clamp-2 hover:underline"
            innerHTML={renderBody(snippet(), snippetMime())}
          />
        </Show>
        <p class="text-xs text-muted mt-1">{relativeTime(props.item.created)}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          onClick={approve}
          disabled={busy()}
          class="text-xs px-2 py-1 rounded bg-accent text-accent-fg hover:opacity-80 disabled:opacity-50 transition-opacity"
        >
          {t("directory.approve")}
        </button>
        <button
          onClick={reject}
          disabled={busy()}
          class="text-xs px-2 py-1 rounded bg-elevated text-txt hover:opacity-80 disabled:opacity-50 transition-opacity"
        >
          {t("moderate.reject")}
        </button>
      </div>
    </div>
  );
}

export default function ModerateView() {
  const { t } = useI18n();

  const [entries, { mutate }] = createQueryResource<PendingItem[]>(
    "moderate-queue",
    fetchModerationQueue,
    { initialValue: [] },
  );

  function removeFromList(iid: number) {
    mutate((prev) => (prev ?? []).filter((i) => i.iid !== iid));
    // Keep PostCard's flag-icon gate in sync with what's left queued.
    refreshPendingModeration();
  }

  return (
    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold text-txt">{t("moderate.title")}</h1>
        <Show when={!entries.loading && (entries() ?? []).length > 0}>
          <span class="text-xs text-muted tabular-nums ml-auto">
            {(entries() ?? []).length}
          </span>
        </Show>
      </div>

      <Show when={entries.loading}>
        <div class="bg-surface border border-rim rounded-2xl overflow-hidden animate-pulse divide-y divide-rim">
          <For each={[1, 2, 3]}>
            {() => (
              <div class="px-4 py-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-elevated shrink-0" />
                <div class="h-3 bg-elevated rounded flex-1" />
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show
        when={!entries.loading && (entries() ?? []).length === 0}
      >
        <div class="flex flex-col items-center gap-3 py-16 text-muted">
          <p class="text-sm font-medium">{t("moderate.empty")}</p>
        </div>
      </Show>

      <Show when={!entries.loading && (entries() ?? []).length > 0}>
        <div class="bg-surface border border-rim rounded-2xl overflow-hidden shadow-sm divide-y divide-rim">
          <For each={entries()}>
            {(item) => <PendingRow item={item} onResolved={removeFromList} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
