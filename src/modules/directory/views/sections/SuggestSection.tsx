import { createSignal, Show, For, onMount } from "solid-js";
import {
  entries, loading, loadingMore, hasMore, total,
  loadDirectory, loadMoreDirectory, resetDirectory,
} from "../../people/store";
import DirectoryCard from "../DirectoryCard";
import DirectoryEntryModal from "../DirectoryEntryModal";
import type { DirectoryEntry } from "../../people/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import CardShell from "@/shared/stream/CardShell";
import { LoadMore } from "@ui/LoadMore";
import { EmptyState } from "@ui/EmptyState";

export default function SuggestSection() {
  const { t } = useI18n();
  const [selected, setSelected] = createSignal<DirectoryEntry | null>(null);

  onMount(() => {
    resetDirectory();
    loadDirectory({ suggest: 1 });
  });

  return (
    <div class="px-4 md:px-6 py-6 space-y-4">
      <Show when={!loading() && total() > 0}>
        <p class="text-sm text-muted">{total().toLocaleString()} {t("directory.suggestions_count")}</p>
      </Show>

      <Show when={loading()}>
        <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
          <For each={Array(12).fill(0)}>{() => <CardSkeleton />}</For>
        </div>
      </Show>

      <Show when={!loading()}>
        <Show
          when={entries().length > 0}
          fallback={<EmptyState>{t("directory.no_suggestions")}</EmptyState>}
        >
          <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
            <For each={entries()}>
              {(entry) => <CardShell uuid={entry.hash} class="grid"><DirectoryCard entry={entry} onSelect={setSelected} /></CardShell>}
            </For>
          </div>
        </Show>

        <LoadMore
          hasMore={hasMore() && !loadingMore()}
          loading={loadingMore()}
          label={t("directory.load_more")}
          onClick={loadMoreDirectory}
        />

        <Show when={loadingMore()}>
          <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
            <For each={Array(6).fill(0)}>{() => <CardSkeleton />}</For>
          </div>
        </Show>

        <Show when={!hasMore() && entries().length > 0}>
          <p class="py-4 text-center text-sm text-muted">{t("directory.end_of_results")}</p>
        </Show>
      </Show>

      <DirectoryEntryModal entry={selected()} onClose={() => setSelected(null)} />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div class="rounded-xl border border-rim bg-surface p-4 space-y-3 animate-pulse">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-full bg-overlay shrink-0" />
        <div class="flex-1 space-y-2">
          <div class="h-4 bg-overlay rounded w-3/4" />
          <div class="h-3 bg-overlay rounded w-1/2" />
        </div>
      </div>
      <div class="h-3 bg-overlay rounded w-full" />
      <div class="h-3 bg-overlay rounded w-2/3" />
    </div>
  );
}
