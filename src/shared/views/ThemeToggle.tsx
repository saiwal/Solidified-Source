import { For, Show, createMemo } from "solid-js";
import { Portal } from "solid-js/web";
import { useTheme } from "@utsukta/spa-core/lib/useTheme";
import { THEMES } from "@utsukta/spa-core/types/theme.types";
import { BiRegularPalette } from "solid-icons/bi";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { Motion, Presence, scalePreset } from "@utsukta/spa-core/lib/motion-presets";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineCheck } from "solid-icons/md";

const ThemeToggle = () => {
  const { t } = useI18n();
  const { theme, switchTheme } = useTheme();
  const { open, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start" });

  const presetThemes = createMemo(() =>
    [...THEMES]
      .filter((t) => t.id !== "custom")
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
  );

  const isCustom = () => theme() === "custom";
  const currentLabel = () => THEMES.find((t) => t.id === theme())?.label ?? theme();

  return (
    <>
      <button
        ref={setTriggerRef}
        onClick={toggle}
        title={t("ui.theme")}
        class={`p-[8px] rounded-lg transition-colors text-muted hover:bg-elevated hover:text-txt
                ${open() ? "bg-elevated text-txt" : ""}`}
      >
        <BiRegularPalette size={18} />
      </button>

      <Presence>
        <Show when={open()}>
          <Portal>
          <Motion.div
            ref={(el: HTMLDivElement) => setPanelRef(el)}
            {...scalePreset}
            style={floatStyle()}
            class="z-50 w-64 bg-surface border border-rim rounded-xl shadow-xl overflow-hidden"
          >
            <div class="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted border-b border-rim flex justify-between">
              <span>{t("ui.themes")}</span>
              <span class="text-muted normal-case">{currentLabel()}</span>
            </div>

            <div class="p-2 grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              <For each={presetThemes()}>
                {(t) => {
                  const active = () => theme() === t.id;
                  return (
                    <button
                      onClick={() => switchTheme(t.id)}
                      class={`rounded-lg border p-2 text-left transition-all
                              ${active() ? "border-accent bg-elevated" : "border-rim hover:bg-elevated"}`}
                    >
                      <div data-theme={t.id} class="rounded-md border border-rim p-2 mb-1">
                        <div class="flex gap-1 mb-1">
                          <div class="w-3 h-3 rounded bg-base border border-rim" />
                          <div class="w-3 h-3 rounded bg-surface" />
                          <div class="w-3 h-3 rounded bg-elevated" />
                          <div class="w-3 h-3 rounded bg-accent" />
                        </div>
                        <div class="h-1.5 w-full rounded bg-muted/40" />
                      </div>
                      <div class="flex items-center justify-between">
                        <span class="text-xs text-txt truncate">{t.label}</span>
                        <Show when={active()}>
                          <MdOutlineCheck class="w-3.5 h-3.5 text-accent" />
                        </Show>
                      </div>
                    </button>
                  );
                }}
              </For>
            </div>

            {/* Custom theme entry */}
            <div class="px-2 pb-2 border-t border-rim pt-2">
              <button
                onClick={() => switchTheme("custom")}
                class={`w-full rounded-lg border p-2 text-left transition-all
                        ${isCustom() ? "border-accent bg-elevated" : "border-rim hover:bg-elevated"}`}
              >
                <div data-theme="custom" class="rounded-md border border-rim p-2 mb-1">
                  <div class="flex gap-1 mb-1">
                    <div class="w-3 h-3 rounded bg-base border border-rim" />
                    <div class="w-3 h-3 rounded bg-surface" />
                    <div class="w-3 h-3 rounded bg-elevated" />
                    <div class="w-3 h-3 rounded bg-accent" />
                  </div>
                  <div class="h-1.5 w-full rounded bg-muted/40" />
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-txt">{t("ui.custom")}</span>
                  <div class="flex items-center gap-1.5">
                    <Show when={isCustom()}>
                      <MdOutlineCheck class="w-3.5 h-3.5 text-accent" />
                    </Show>
                    <span class="text-xs text-muted">{t("ui.display_settings")}</span>
                  </div>
                </div>
              </button>
            </div>
          </Motion.div>
          </Portal>
        </Show>
      </Presence>
    </>
  );
};

export default ThemeToggle;
