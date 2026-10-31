import { createEffect, createSignal, lazy, Show, For } from "solid-js";
import { useMapsEnabled } from "@utsukta/spa-core/lib/useOsmMap";
import {
  entries, loading, loadingMore, hasMore, keywordCloud,
  loadDirectory, loadMoreDirectory,
} from "../../people/store";
import {
  safe, setSafe,
  pubforums, setPubforums, globalDir, setGlobalDir,
} from "../../people/filters";
import DirectoryCard, { CardSkeleton } from "../DirectoryCard";
import DirectoryEntryModal from "../DirectoryEntryModal";
import type { DirectoryEntry } from "../../people/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import CardShell from "@/shared/stream/CardShell";
import { Section, SearchToggle } from "../Section";
import { EmptyState } from "@ui/EmptyState";
import { Tabs } from "@ui/Tabs";
import { Chip } from "@ui/Chip";
import { LoadMore } from "@ui/LoadMore";

const PlaceMap = lazy(() => import("@/shared/views/PlaceMap"));

type Order = "date" | "rdate" | "alphabetic" | "ralpha";

const KEYWORD_CAP = 12;

export default function DirectorySection() {
  const { t } = useI18n();
  const [appliedSearch, setAppliedSearch] = createSignal("");
  const [allKeywords, setAllKeywords] = createSignal(false);
  // The picked keyword leads even when it's off the cloud, so the cap never hides it.
  const keywords = () => {
    const cloud = keywordCloud();
    const k = keyword();
    if (!k) return cloud;
    return [cloud.find((x) => x.term === k) ?? { term: k, weight: 0 }, ...cloud.filter((x) => x.term !== k)];
  };
  const [order, setOrder] = createSignal<Order>("date");
  const [keyword, setKeyword] = createSignal("");
  const [selected, setSelected] = createSignal<DirectoryEntry | null>(null);
  const [view, setView] = createSignal<"grid" | "map">("grid");
  const mapsOn = useMapsEnabled();
  const showMap = () => mapsOn() && view() === "map";

  createEffect(() => {
    loadDirectory({
      search: appliedSearch(),
      keywords: keyword() || undefined,
      order: order(),
      global: globalDir(),
      safe: safe(),
      pubforums: pubforums(),
    });
  });


  return (
    <Section
      title={t("directory.people_groups")}
      tools={
        <>
          <SearchToggle
            applied={appliedSearch()}
            onSearch={setAppliedSearch}
            placeholder={t("directory.search_placeholder")}
          />
          <Show when={mapsOn()}>
            <Tabs
              variant="segmented"
              label={t("ui.view_map")}
              value={view()}
              onChange={setView}
              items={[{ value: "grid", label: t("ui.view_grid") }, { value: "map", label: t("ui.view_map") }]}
            />
          </Show>
        </>
      }
    >
      {/* ── Filters + sort ── */}
      <div class="flex flex-wrap items-center gap-2">
        {/* Scope — the standard segmented switcher, 32px like the sm buttons */}
        <Tabs
          variant="segmented"
          label={t("directory.filter_scope")}
          value={globalDir() === 1 ? "global" : "local"}
          onChange={(v) => setGlobalDir(v === "global" ? 1 : 0)}
          items={[
            { value: "global", label: t("directory.global_dir") },
            { value: "local", label: t("directory.local_dir") },
          ]}
        />
        <Chip
          selected={pubforums() === 1}
          onClick={() => setPubforums(pubforums() === 1 ? 0 : 1)}
        >
          {t("directory.filter_forums_only")}
        </Chip>
        <Chip
          selected={safe() === 1}
          onClick={() => setSafe(safe() === 1 ? 0 : 1)}
        >
          {t("directory.filter_safe_mode")}
        </Chip>
        {/* Same quiet picker as Connections' sort, pinned right. */}
        <select
          aria-label={t("directory.sort_by")}
          value={order()}
          onChange={(e) => setOrder(e.currentTarget.value as Order)}
          class="shrink-0 ml-auto bg-transparent text-muted text-sm focus:outline-none hover:text-txt cursor-pointer"
        >
          <option value="date">{t("directory.sort_newest")}</option>
          <option value="rdate">{t("directory.sort_oldest")}</option>
          <option value="alphabetic">{t("directory.sort_az")}</option>
          <option value="ralpha">{t("directory.sort_za")}</option>
        </select>
      </div>

      {/* ── Keyword cloud (xtag) — the picked one stays even off the list ── */}
      <Show when={keywordCloud().length > 0 || keyword()}>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label={t("directory.keywords")}>
          <For each={allKeywords() ? keywords() : keywords().slice(0, KEYWORD_CAP)}>
            {(k) => (
              <Chip selected={keyword() === k.term} onClick={() => setKeyword(keyword() === k.term ? "" : k.term)}>
                #{k.term}
              </Chip>
            )}
          </For>
          <Show when={keywords().length > KEYWORD_CAP}>
            <Chip size="md" class="border-dashed" onClick={() => setAllKeywords((v) => !v)}>
              {allKeywords() ? t("ui.show_less") : `${t("ui.show_more")} (${keywords().length - KEYWORD_CAP})`}
            </Chip>
          </Show>
        </div>
      </Show>

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
          {/* Map covers the loaded entries — Load more adds pins */}
          <Show when={showMap()}>
            <PlaceMap items={entries().map((e) => ({ place: e.location ?? "", name: e.name, open: () => setSelected(e) }))} />
          </Show>
          <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]" classList={{ hidden: showMap() }}>
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

        <Show when={loadingMore() && !showMap()}>
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
    </Section>
  );
}
