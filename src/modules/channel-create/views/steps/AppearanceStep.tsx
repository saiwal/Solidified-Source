import { For, Show } from "solid-js";
import { THEMES, type ThemeId } from "@utsukta/spa-core/types/theme.types";
import { FONT_SIZES, FONT_FAMILIES, type FontSize } from "@utsukta/spa-core/lib/typography";
import { RADIUS_MAP, type CornerRadius } from "@utsukta/spa-core/lib/corner-radius";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillCheck } from "solid-icons/md";
import { Badge } from "@ui/Badge";

const FONT_SIZE_OPTS: { value: FontSize; labelKey: string }[] = [
  { value: "small", labelKey: "settings.font_size_small" },
  { value: "medium", labelKey: "settings.font_size_medium" },
  { value: "large", labelKey: "settings.font_size_large" },
  { value: "xl", labelKey: "settings.font_size_xl" },
];

const RADIUS_OPTS: { value: CornerRadius; labelKey: string; px: string }[] = [
  { value: "none", labelKey: "settings.corner_radius_none", px: "0px" },
  { value: "sm", labelKey: "settings.corner_radius_sm", px: "4px" },
  { value: "default", labelKey: "settings.corner_radius_default", px: "8px" },
  { value: "lg", labelKey: "settings.corner_radius_lg", px: "12px" },
  { value: "xl", labelKey: "settings.corner_radius_xl", px: "18px" },
];

export default function AppearanceStep(props: {
  colorScheme: ThemeId;
  setColorScheme: (v: ThemeId) => void;
  fontSize: FontSize;
  setFontSize: (v: FontSize) => void;
  cornerRadius: CornerRadius;
  setCornerRadius: (v: CornerRadius) => void;
}) {
  const { t } = useI18n();

  const previewRadiusVars = () => {
    const overrides = RADIUS_MAP[props.cornerRadius];
    const vars: Record<string, string> = {};
    if (overrides) for (const [k, v] of Object.entries(overrides)) vars[k] = v;
    return vars;
  };

  return (
    <div class="space-y-5">
      {/* Live preview card, scoped to the chosen theme/typography/radius */}
      <div
        data-theme={props.colorScheme}
        class="rounded-xl border border-rim bg-base p-4"
        style={{
          "font-family": FONT_FAMILIES.system,
          ...previewRadiusVars(),
        }}
      >
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-full bg-accent-muted shrink-0" />
          <div class="flex-1 min-w-0 space-y-1">
            <div class="h-2.5 w-28 rounded bg-txt" />
            <div class="h-2 w-16 rounded bg-muted" />
          </div>
        </div>
        <div
          class="mt-3 space-y-1.5"
          style={{ "font-size": FONT_SIZES[props.fontSize] }}
        >
          <p class="text-txt leading-snug">{t("channel_create.preview_text")}</p>
        </div>
        <div class="mt-3 flex gap-2">
          <Badge>
            {t("channel_create.preview_like")}
          </Badge>
          <span class="px-2.5 py-1 rounded-lg bg-accent text-accent-fg text-xs font-medium">
            {t("channel_create.preview_reply")}
          </span>
        </div>
      </div>

      {/* Color scheme swatches */}
      <div class="space-y-2">
        <label class="text-sm font-medium text-txt">{t("channel_create.color_scheme_label")}</label>
        <div class="grid grid-cols-3 sm:grid-cols-4 gap-2">
          <For each={THEMES.filter((th) => th.id !== "custom")}>
            {(th) => {
              const selected = () => props.colorScheme === th.id;
              return (
                <button
                  type="button"
                  data-theme={th.id}
                  onClick={() => props.setColorScheme(th.id)}
                  class={`relative rounded-lg border-2 p-2 bg-base text-left transition-colors
                    ${selected() ? "border-accent" : "border-rim hover:border-rim-strong"}`}
                >
                  <div class="flex gap-1 mb-1.5">
                    <span class="w-3 h-3 rounded-full bg-surface border border-rim" />
                    <span class="w-3 h-3 rounded-full bg-accent" />
                    <span class="w-3 h-3 rounded-full bg-elevated border border-rim" />
                  </div>
                  <span class="block text-[0.625rem] text-txt truncate">{th.label}</span>
                  <Show when={selected()}>
                    <div class="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-accent text-accent-fg flex items-center justify-center">
                      <MdFillCheck class="w-2.5 h-2.5" />
                    </div>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </div>

      {/* Font size */}
      <div class="space-y-2">
        <label class="text-sm font-medium text-txt">{t("settings.font_size")}</label>
        <div class="flex gap-3 flex-wrap">
          <For each={FONT_SIZE_OPTS}>
            {(size) => (
              <label class="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="nc-font-size"
                  checked={props.fontSize === size.value}
                  onChange={() => props.setFontSize(size.value)}
                  class="accent-accent cursor-pointer"
                />
                <span class="text-sm text-txt">{t(size.labelKey as any)}</span>
              </label>
            )}
          </For>
        </div>
      </div>

      {/* Corner radius */}
      <div class="space-y-2">
        <label class="text-sm font-medium text-txt">{t("settings.corner_radius")}</label>
        <div class="flex gap-2 flex-wrap">
          <For each={RADIUS_OPTS}>
            {(opt) => {
              const selected = () => props.cornerRadius === opt.value;
              return (
                <button
                  type="button"
                  onClick={() => props.setCornerRadius(opt.value)}
                  class={`flex flex-col items-center gap-1.5 px-3 py-2 border rounded-lg
                    transition-colors cursor-pointer text-xs
                    ${selected() ? "border-accent bg-accent/10 text-accent" : "border-rim bg-surface text-muted hover:border-rim-strong hover:text-txt"}`}
                >
                  <span
                    class="w-8 h-8 border-2 bg-elevated shrink-0"
                    style={{
                      "border-color": selected() ? "var(--color-accent)" : "var(--color-rim-strong)",
                      "border-radius": opt.px,
                    }}
                  />
                  <span>{t(opt.labelKey as any)}</span>
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
