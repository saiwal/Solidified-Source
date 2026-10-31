// HQ card listing the newest posts of one saved search (config.searchId).
// The id is resolved live against the saved-search list, so deleting the
// search turns the card back into its "pick one" state instead of keeping
// a stale copy of its params.

import { createSignal, onMount } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { savedSearches, loadSavedSearches } from "@/modules/network/saved-searches";
import { FilteredPostsList, type CardConfig } from "./FilteredPostsList";

export type SavedSearchConfig = CardConfig & { searchId?: number };

export default function SavedSearchPostsWidget(props: { config?: SavedSearchConfig }) {
  const { t } = useI18n();
  const [ready, setReady] = createSignal(false);
  onMount(() => void loadSavedSearches().finally(() => setReady(true)));

  const search = () => savedSearches().find((s) => s.id === props.config?.searchId);
  const params = () => {
    const s = search();
    if (!s) return null;
    return props.config?.unseen ? { ...s.params, unseen: "1" } : s.params;
  };

  return (
    <FilteredPostsList
      title={search()?.label ?? t("widgets.saved_search_posts")}
      params={params()}
      count={props.config?.count}
      empty={ready() ? t("widgets.cfg_pick_saved_search") : null}
    />
  );
}
