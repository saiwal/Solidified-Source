// Shared edit-mode settings form for the taxonomy widgets (categories, tags,
// archive). Each family ships a thin wrapper that names its own style options
// and whether it offers rainbow mode.

import { createSignal, For, Show } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";

export interface StyleOption {
  value: string;
  label: string;
}

export interface StyleConfigFormProps extends WidgetConfigProps {
  options: StyleOption[];
  /** Style used when the widget has no saved config yet. */
  fallback: string;
  /** Offer the rainbow-text toggle. */
  rainbow?: boolean;
}

export default function StyleConfigForm(props: StyleConfigFormProps) {
  const { t } = useI18n();
  const [style, setStyle] = createSignal(String(props.config.style ?? props.fallback));
  const [rainbow, setRainbow] = createSignal(props.config.rainbow === true);

  return (
    <div class="flex flex-col gap-2">
      <fieldset class="flex flex-col gap-1">
        <legend class="text-xs text-muted">{t("widgets.widget_style")}</legend>
        <div class="flex flex-wrap gap-1.5 mt-1">
          <For each={props.options}>
            {(opt) => (
              <Button
                variant="ghost"
                size="sm"
                pressed={style() === opt.value}
                onClick={() => setStyle(opt.value)}
              >
                {opt.label}
              </Button>
            )}
          </For>
        </div>
      </fieldset>

      <Show when={props.rainbow}>
        <label class="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={rainbow()}
            onChange={(e) => setRainbow(e.currentTarget.checked)}
            class="accent-[var(--color-accent)]"
          />
          {t("widgets.rainbow_mode")}
        </label>
      </Show>

      <Button size="sm" class="self-end" onClick={() =>
          props.onSave(
            props.rainbow ? { style: style(), rainbow: rainbow() } : { style: style() },
          )
        }>
        {t("widgets.cfg_save")}
      </Button>
    </div>
  );
}
