// Settings form for channel.feed_newspaper: pick which categories get a
// section, in the order they're ticked. None ticked = no sections.

import { createSignal, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import { Button } from "@ui/Button";

export default function ChannelNewspaperConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const initial = Array.isArray(props.config.categories) ? props.config.categories.map(String) : [];
  const [picked, setPicked] = createSignal<string[]>(initial);

  const [categories] = createQueryResource(
    "channel-newspaper-categories",
    () => nick() || null,
    (n) => fetchCategories({ channelNick: n, type: "posts" }),
  );

  const toggle = (slug: string, on: boolean) =>
    setPicked((p) => (on ? [...p, slug] : p.filter((s) => s !== slug)));

  return (
    <div class="flex flex-col gap-2">
      <fieldset class="flex flex-col gap-1">
        <legend class="text-xs text-muted">{t("widgets.cfg_newspaper_sections")}</legend>
        <p class="text-[0.6875rem] text-subtle">{t("widgets.cfg_newspaper_sections_hint")}</p>
        <Show when={(categories() ?? []).length > 0} fallback={<p class="text-xs text-muted">{t("widgets.cfg_no_categories")}</p>}>
          <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1 max-h-48 overflow-y-auto">
            <For each={categories()}>
              {(c) => (
                <label class="flex items-center gap-1.5 text-xs text-txt">
                  <input
                    type="checkbox"
                    checked={picked().includes(c.slug)}
                    onChange={(e) => toggle(c.slug, e.currentTarget.checked)}
                    class="accent-[var(--color-accent)]"
                  />
                  {c.name}
                  <Show when={picked().includes(c.slug)}>
                    <span class="text-[0.625rem] text-subtle">#{picked().indexOf(c.slug) + 1}</span>
                  </Show>
                </label>
              )}
            </For>
          </div>
        </Show>
      </fieldset>
      <Button size="sm" class="self-end" onClick={() => props.onSave({ categories: picked() })}>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
