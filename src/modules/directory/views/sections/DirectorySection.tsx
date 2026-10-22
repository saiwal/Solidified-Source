import { createEffect, createSignal, Show, For } from "solid-js";
import {
  entries, loading, loadingMore, hasMore,
  loadDirectory, loadMoreDirectory,
} from "../../people/store";
import {
  safe, setSafe,
  pubforums, setPubforums, globalDir, setGlobalDir,
} from "../../people/filters";
import DirectoryCard from "../DirectoryCard";
import DirectoryEntryModal from "../DirectoryEntryModal";
import type { DirectoryEntry } from "../../people/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import CardShell from "@/shared/stream/CardShell";
import { Button } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { EmptyState } from "@ui/EmptyState";

type Order = "date" | "rdate" | "alphabetic" | "ralpha";

export default function DirectorySection() {
  const { t } = useI18n();
  const [searchInput, setSearchInput] = createSignal("");
  const [appliedSearch, setAppliedSearch] = createSignal("");
  const [order, setOrder] = createSignal<Order>("date");
  const [selected, setSelected] = createSignal<DirectoryEntry | null>(null);

  createEffect(() => {
    loadDirectory({
      search: appliedSearch(),
      order: order(),
      global: globalDir(),
      safe: safe(),
      pubforums: pubforums(),
    });
  });

  function handleSearch(e: Event) {
    e.preventDefault();
    setAppliedSearch(searchInput());
  }

  return (
    <div class="px-4 md:px-6 py-6 space-y-4">

      {/* ── Search row ── */}
      <form onSubmit={handleSearch} class="flex gap-2">
        <Input
          class="flex-1"
          type="text"
          value={searchInput()}
          onInput={(e) => setSearchInput(e.currentTarget.value)}
          placeholder="Name, address, or keyword…"
        />
        <Button class="shrink-0" type="submit">
          {t("directory.search")}
        </Button>
      </form>

      {/* ── Filter bar ── */}
      <div class="flex flex-wrap items-center gap-2">

        {/* Sort */}
        <Select value={order()} onChange={(e) => setOrder(e.currentTarget.value as Order)}>
          <option value="date">{t("directory.sort_newest")}</option>
          <option value="rdate">{t("directory.sort_oldest")}</option>
          <option value="alphabetic">{t("directory.sort_az")}</option>
          <option value="ralpha">{t("directory.sort_za")}</option>
        </Select>

        {/* Divider */}
        <span class="hidden sm:block w-px h-5 bg-rim" />

        {/* Scope toggle */}
        <div class="flex rounded-lg border border-rim overflow-hidden text-sm">
          <button
            onClick={() => setGlobalDir(1)}
            class={`px-3 py-1.5 transition-colors ${
              globalDir() === 1
                ? "bg-accent-muted text-accent font-medium"
                : "bg-surface text-muted hover:bg-overlay"
            }`}
          >
            {t("directory.global_dir")}
          </button>
          <div class="w-px bg-rim" />
          <button
            onClick={() => setGlobalDir(0)}
            class={`px-3 py-1.5 transition-colors ${
              globalDir() === 0
                ? "bg-accent-muted text-accent font-medium"
                : "bg-surface text-muted hover:bg-overlay"
            }`}
          >
            {t("directory.local_dir")}
          </button>
        </div>

        {/* Divider */}
        <span class="hidden sm:block w-px h-5 bg-rim" />

        {/* Forums chip */}
        <button
          onClick={() => setPubforums(pubforums() === 1 ? 0 : 1)}
          class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            pubforums() === 1
              ? "border-accent bg-accent-muted text-accent font-medium"
              : "border-rim bg-surface text-muted hover:bg-overlay"
          }`}
        >
          {t("directory.filter_forums_only")}
        </button>

        {/* Safe mode chip */}
        <button
          onClick={() => setSafe(safe() === 1 ? 0 : 1)}
          class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            safe() === 1
              ? "border-accent bg-accent-muted text-accent font-medium"
              : "border-rim bg-surface text-muted hover:bg-overlay"
          }`}
        >
          {t("directory.filter_safe_mode")}
        </button>
      </div>

      {/* ── Skeleton ── */}
      <Show when={loading()}>
        <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
          <For each={Array(12).fill(0)}>{() => <CardSkeleton />}</For>
        </div>
      </Show>

      {/* ── Results ── */}
      <Show when={!loading()}>
        <Show
          when={entries().length > 0}
          fallback={<EmptyState>{t("directory.no_channels")}</EmptyState>}
        >
          <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
            <For each={entries()}>
              {(entry) => <CardShell uuid={entry.hash} class="grid"><DirectoryCard entry={entry} onSelect={setSelected} /></CardShell>}
            </For>
          </div>
        </Show>

        <Show when={hasMore() && !loadingMore()}>
          <div class="flex justify-center py-4">
            <Button variant="ghost" onClick={loadMoreDirectory}>
              {t("directory.load_more")}
            </Button>
          </div>
        </Show>

        <Show when={loadingMore()}>
          <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
            <For each={Array(6).fill(0)}>{() => <CardSkeleton />}</For>
          </div>
        </Show>

        <Show when={!hasMore() && entries().length > 0}>
          <p class="py-4 text-center text-sm text-muted">{t("directory.end_of_results")}</p>
        </Show>
      </Show>

      {/* ── Detail modal ── */}
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
