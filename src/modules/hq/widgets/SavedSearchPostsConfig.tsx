// Settings form for SavedSearchPostsWidget: which saved search, how many posts.

import { createSignal, For, onMount, Show } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { savedSearches, loadSavedSearches } from "@/modules/network/saved-searches";
import { CommonFields } from "./FilterPostsConfig";
import type { CardConfig } from "./FilteredPostsList";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export default function SavedSearchPostsConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  onMount(() => void loadSavedSearches());
  const [searchId, setSearchId] = createSignal(Number(props.config.searchId ?? 0));
  const [common, setCommon] = createSignal<CardConfig>({ count: props.config.count as number, unseen: !!props.config.unseen });

  return (
    <div class="flex flex-col gap-2">
      <Show when={savedSearches().length > 0} fallback={<p class="text-xs text-muted">{t("widgets.cfg_no_saved_searches")}</p>}>
        <label class="text-xs text-muted">
          {t("widgets.cfg_saved_search")}
          <Select size="sm" class="mt-1 w-full" value={String(searchId())} onChange={(e) => setSearchId(Number(e.currentTarget.value))}>
            <option value="0" disabled>—</option>
            <For each={savedSearches()}>{(s) => <option value={String(s.id)}>{s.label}</option>}</For>
          </Select>
        </label>
      </Show>
      <CommonFields value={common()} onChange={setCommon} />
      <Button size="sm" class="self-end" disabled={!searchId()} onClick={() => props.onSave({ ...common(), searchId: searchId() })}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
