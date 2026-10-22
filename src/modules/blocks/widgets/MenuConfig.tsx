// Shared settings form for MenuBarWidget / MenuTreeWidget instances: pick one
// of the owner's Hubzilla menus (managed under /webpages/:nick/menus or the
// stock Menus app) plus an optional displayed title.

import { createSignal, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchMyMenus } from "@utsukta/spa-core/lib/menus";
import { Button } from "@ui/Button";
import { Input, Select } from "@ui/Field";

export default function MenuConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const [menu, setMenu] = createSignal(String(props.config.menu ?? ""));
  const [title, setTitle] = createSignal(String(props.config.title ?? ""));

  const [menus] = createQueryResource("my-menus", fetchMyMenus);

  const save = () => {
    const config: Record<string, unknown> = { menu: menu() };
    if (title().trim()) config.title = title().trim();
    props.onSave(config);
  };

  return (
    <div class="flex flex-col gap-2">
      <label class="text-xs text-muted">
        {t("widgets.cfg_menu")}
        <Select size="sm" class="mt-1 w-full" value={menu()} onChange={(e) => setMenu(e.currentTarget.value)}>
          <option value="">—</option>
          <For each={menus() ?? []}>
            {(m) => (
              <option value={m.name}>
                {m.desc ? `${m.desc} (${m.name})` : m.name}
              </option>
            )}
          </For>
        </Select>
      </label>
      <Show when={!menus.loading && (menus() ?? []).length === 0}>
        <p class="text-[0.625rem] text-muted">{t("widgets.cfg_no_menus")}</p>
      </Show>

      <label class="text-xs text-muted">
        {t("widgets.cfg_title")}
        <Input
          size="sm"
          class="mt-1 w-full"
          type="text"
          value={title()}
          maxLength={60}
          onInput={(e) => setTitle(e.currentTarget.value)}
        />
      </label>

      <Button size="sm" class="self-end" onClick={save} disabled={!menu()}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
