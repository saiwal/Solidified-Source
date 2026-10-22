// Settings form for ItemCardWidget instances: pick which catalog item the
// card shows. Rendered in Slot's edit-mode config panel (owner only).

import { createSignal, For } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchCatalog } from "../api";
import { Button } from "@ui/Button";
import { Select } from "@ui/Field";

export default function ItemCardConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const [sku, setSku] = createSignal(String(props.config.sku ?? ""));

  const [catalog] = createQueryResource("cart-catalog", () => nick() || null, fetchCatalog);

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_item")}
        <Select size="sm" class="mt-1 w-full" value={sku()} onChange={(e) => setSku(e.currentTarget.value)}>
          <option value="">—</option>
          <For each={catalog() ?? []}>
            {(item) => (
              <option value={item.sku}>
                {item.desc} — {item.price}
              </option>
            )}
          </For>
        </Select>
      </label>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ sku: sku() })} disabled={!sku()}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
