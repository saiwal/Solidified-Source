import { useI18n, LOCALES, type Locale } from "@utsukta/spa-core/i18n/index";
import { For, Show } from "solid-js";
import { Motion, Presence, scalePreset } from "@utsukta/spa-core/lib/motion-presets";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { MdOutlineCheck } from "solid-icons/md";
import { IconButton } from "@ui/Button";

const LanguageSwitcher = () => {
  const { t, locale, setLocale } = useI18n();
  const { open, setOpen, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start" });

  const handleSelect = (value: Locale) => {
    setLocale(value);
    setOpen(false);
  };

  return (
    <>
      <IconButton
        label={t("ui.language")}
        aria-expanded={open()}
        class={open() ? "bg-elevated text-txt" : ""}
        ref={setTriggerRef}
        onClick={toggle}
      >
        <span class="text-xs font-semibold uppercase tracking-wide">{locale()}</span>
      </IconButton>

      <Presence>
        <Show when={open()}>
          <Motion.div
            ref={(el: HTMLDivElement) => setPanelRef(el)}
            {...scalePreset}
            style={floatStyle()}
            class="z-50 w-44 bg-surface border border-rim rounded-lg shadow-lg overflow-hidden"
          >
            <div class="px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-widest text-muted border-b border-rim">
              {t("ui.language")}
            </div>
            <div class="py-1">
              <For each={LOCALES}>
                {(l) => (
                  <button
                    onClick={() => handleSelect(l.value)}
                    class={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors
                            ${locale() === l.value
                              ? "bg-elevated text-txt font-medium"
                              : "text-muted hover:bg-elevated hover:text-txt"}`}
                  >
                    <span class="text-xs font-semibold uppercase tracking-wide w-6 shrink-0">{l.value}</span>
                    <span>{l.label}</span>
                    <Show when={locale() === l.value}>
                      <MdOutlineCheck class="w-3.5 h-3.5 ml-auto shrink-0" />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Motion.div>
        </Show>
      </Presence>
    </>
  );
};

export default LanguageSwitcher;
