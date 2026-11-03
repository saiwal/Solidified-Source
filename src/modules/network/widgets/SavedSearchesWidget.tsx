import { For, Show, onMount } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { MdFillBookmarks, MdFillDelete } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { savedSearches, loadSavedSearches, removeSavedSearch, type SavedSearch } from "../saved-searches";
import { applyNetwork } from "../store";
import { parseNetworkParams } from "../api";
import { IconButton } from "@ui/Button";
import { WidgetShell } from "@ui/WidgetShell";

const ALL_PARAM_KEYS = [
  "order", "search", "tag", "lang", "star", "pf", "conv", "dm", "event",
  "dbegin", "dend", "cmin", "cmax", "cid", "gid", "xchan_label",
] as const;

const CLEAR_PARAMS = Object.fromEntries(ALL_PARAM_KEYS.map((k) => [k, undefined])) as Record<string, undefined>;

export default function SavedSearchesWidget() {
  const { t } = useI18n();
  const [, setSearchParams] = useSearchParams();

  onMount(() => { void loadSavedSearches(); });

  function apply(s: SavedSearch) {
    setSearchParams({ ...CLEAR_PARAMS, ...s.params }, { replace: true });
    setTimeout(() => applyNetwork(parseNetworkParams(s.params)), 0);
  }

  return (
    <Show when={savedSearches().length > 0}>
      <WidgetShell
        icon={<MdFillBookmarks size={14} />}
        title={t("network.saved_searches")}
      >
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
                <IconButton
                  label={t("network.delete_saved_search")}
                  variant="danger"
                  size="sm"
                  class="opacity-100 md:opacity-0 md:group-hover:opacity-100 shrink-0"
                  onClick={() => void removeSavedSearch(s.id)}
                >
                  <MdFillDelete size={13} />
                </IconButton>
              </div>
            )}
          </For>
        </div>
      </WidgetShell>
    </Show>
  );
}
