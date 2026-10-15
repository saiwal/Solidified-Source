import { For, Show, onMount } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { MdFillBookmarks, MdFillDelete } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { savedSearches, loadSavedSearches, removeSavedSearch, type SavedSearch } from "../saved-searches";
import { loadNetwork, resetPosts } from "../store";
import type { NetworkParams } from "../api";

const ALL_PARAM_KEYS = [
  "order", "search", "tag", "star", "pf", "conv", "dm", "event",
  "dbegin", "dend", "cmin", "cmax", "cid", "gid", "xchan_label",
] as const;

const CLEAR_PARAMS = Object.fromEntries(ALL_PARAM_KEYS.map((k) => [k, undefined])) as Record<string, undefined>;

function paramsToNetworkParams(params: Record<string, string>): NetworkParams {
  const p: NetworkParams = {};
  if (params.order && params.order !== "created") p.order = params.order as NetworkParams["order"];
  if (params.search)  p.search  = params.search;
  if (params.tag)     p.tag     = params.tag;
  if (params.star  === "1") p.star  = 1;
  if (params.pf    === "1") p.pf    = 1;
  if (params.conv  === "1") p.conv  = 1;
  if (params.dm    === "1") p.dm    = 1;
  if (params.event === "1") p.event = 1;
  if (params.dbegin) p.dbegin = params.dbegin;
  if (params.dend)   p.dend   = params.dend;
  if (params.cmin)   p.cmin   = Number(params.cmin);
  if (params.cmax)   p.cmax   = Number(params.cmax);
  if (params.cid)    p.cid    = Number(params.cid);
  if (params.gid)    p.gid    = Number(params.gid);
  return p;
}

export default function SavedSearchesWidget() {
  const { t } = useI18n();
  const [, setSearchParams] = useSearchParams();

  onMount(() => { void loadSavedSearches(); });

  function apply(s: SavedSearch) {
    setSearchParams({ ...CLEAR_PARAMS, ...s.params }, { replace: true });
    setTimeout(() => {
      resetPosts();
      loadNetwork(paramsToNetworkParams(s.params));
    }, 0);
  }

  return (
    <Show when={savedSearches().length > 0}>
      <div class="bg-surface border border-rim rounded-xl overflow-hidden">
        <div class="px-4 py-3 flex items-center gap-2">
          <MdFillBookmarks size={14} class="text-muted shrink-0" />
          <h2 class="text-sm font-semibold text-txt">{t("network.saved_searches")}</h2>
        </div>
        <div class="px-3 py-2 space-y-1 max-h-[26rem] overflow-y-auto">
          <For each={savedSearches()}>
            {(s) => (
              <div class="flex items-center gap-1 group">
                <button
                  onClick={() => apply(s)}
                  class="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm
                         text-left text-muted hover:bg-elevated hover:text-txt transition-colors
                         min-w-0"
                >
                  <MdFillBookmarks size={13} class="shrink-0 text-accent opacity-70" />
                  <span class="truncate">{s.label}</span>
                </button>
                <button
                  onClick={() => void removeSavedSearch(s.id)}
                  title={t("network.delete_saved_search")}
                  class="p-1.5 rounded-lg text-muted opacity-100 md:opacity-0 md:group-hover:opacity-100
                         hover:text-red-500 hover:bg-elevated transition-all shrink-0"
                >
                  <MdFillDelete size={13} />
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
