// Settings form for RssWidget instances: feed URL + how many items to show.

import { createSignal, For } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input, Select } from "@ui/Field";

const COUNTS = [3, 5, 10];

export default function RssConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [url, setUrl] = createSignal(String(props.config.url ?? ""));
  const [count, setCount] = createSignal(Number(props.config.count ?? 5));

  const valid = () => /^https?:\/\/.+/.test(url().trim());

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_feed_url")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="url"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://example.com/feed.xml"
        />
      </label>
      <label class="text-xs text-muted">
        {t("widgets.cfg_item_count")}
        <Select
          size="sm"
          class="mt-1 w-full"
          value={String(count())}
          onChange={(e) => setCount(Number(e.currentTarget.value))}
        >
          <For each={COUNTS}>{(n) => <option value={String(n)}>{n}</option>}</For>
        </Select>
      </label>
      <Button
        size="sm"
        class="self-end"
        onClick={() => props.onSave({ url: url().trim(), count: count() })}
        disabled={!valid()}
      >
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
