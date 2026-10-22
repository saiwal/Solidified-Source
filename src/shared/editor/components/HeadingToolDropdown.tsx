/**
 * HeadingToolDropdown.tsx
 * Icon-trigger + floating panel for the heading tool in EditorToolbar —
 * same pattern as ListToolDropdown, replacing the old native <select> that
 * showed "Heading…"/H1…H6 as visible text on the toolbar itself.
 */

import { Show, For, createSignal } from "solid-js";
import { MdOutlineTitle } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { IconButton } from "@ui/Button";

export interface HeadingToolDropdownProps {
  disabled?: boolean;
  /** "p" resets to a plain paragraph; "h1"–"h6" apply that heading level. */
  onSelect: (value: string) => void;
}

const LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export default function HeadingToolDropdown(props: HeadingToolDropdownProps) {
  const { t } = useI18n();
  const { open, setOpen, toggle: toggleOpen, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "bottom-start", offset: 4 });

  // Read on open, while the editor selection is still intact (the trigger and
  // the panel items suppress mousedown, so it survives the whole interaction).
  const [active, setActive] = createSignal("");
  function toggle() {
    if (props.disabled) return;
    if (!open()) {
      const cur = (document.queryCommandValue("formatBlock") || "").toLowerCase();
      setActive(/^h[1-6]$/.test(cur) ? cur : "p");
    }
    toggleOpen();
  }

  const itemClass = (value: string) =>
    "flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-elevated transition-colors text-left " +
    (active() === value ? "text-accent font-semibold" : "text-txt");

  const Check = (p: { on: boolean }) => (
    <span class="w-3 shrink-0">{p.on ? "\u2713" : ""}</span>
  );

  function select(value: string) {
    props.onSelect(value);
    setOpen(false);
  }

  return (
    <>
      <IconButton
        label={t("editor.heading")}
        size="sm"
        aria-expanded={open()}
        class={open() ? "bg-elevated text-txt" : ""}
        ref={setTriggerRef}
        disabled={props.disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        <MdOutlineTitle class="w-4 h-4" />
      </IconButton>

      <Show when={open()}>
        <div
          ref={setPanelRef}
          class="z-50 w-36 py-1 bg-surface border border-rim rounded-lg shadow-xl flex flex-col"
          style={floatStyle()}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select("p")}
            class={itemClass("p")}
          >
            <Check on={active() === "p"} />
            {t("editor.paragraph_label")}
          </button>
          <For each={LEVELS}>
            {(level) => (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(level)}
                class={itemClass(level) + " uppercase"}
              >
                <Check on={active() === level} />
                {level}
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}
