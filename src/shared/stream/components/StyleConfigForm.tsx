// Shared edit-mode settings form for the taxonomy widgets (categories, tags,
// archive). Each family ships a thin wrapper that names its own style options
// and whether it offers rainbow mode.

import { createSignal, For, Show } from "solid-js";
import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";

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
              <button
                type="button"
                onClick={() => setStyle(opt.value)}
                aria-pressed={style() === opt.value}
                class="px-2.5 py-1 rounded-lg border text-xs transition-colors"
                classList={{
                  "bg-accent text-accent-fg border-accent": style() === opt.value,
                  "bg-elevated text-txt border-rim hover:border-accent": style() !== opt.value,
                }}
              >
                {opt.label}
              </button>
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

      <button
        onClick={() =>
          props.onSave(
            props.rainbow ? { style: style(), rainbow: rainbow() } : { style: style() },
          )
        }
        class="self-end px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium
               hover:brightness-110 transition-all"
      >
        {t("widgets.cfg_save")}
      </button>
    </div>
  );
}
