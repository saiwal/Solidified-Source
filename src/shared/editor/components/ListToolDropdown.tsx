/**
 * ListToolDropdown.tsx
 * Groups the list tools (bullet / numbered / lettered) behind one icon
 * button in EditorToolbar, matching EmojiPicker's icon-trigger + floating
 * panel pattern instead of a native <select>.
 */

import { Show, createSignal } from "solid-js";
import { MdOutlineFormat_list_bulleted, MdOutlineFormat_list_numbered } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";

export type ListKind = "bullet" | "number" | "alpha";

export interface ListToolDropdownProps {
  disabled?: boolean;
  onSelect: (kind: ListKind) => void;
}

export default function ListToolDropdown(props: ListToolDropdownProps) {
  const { t } = useI18n();
  const { open, setOpen, toggle: toggleOpen, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "bottom-start", offset: 4 });

  // Read on open, while the editor selection is still intact (trigger and
  // items both suppress mousedown, so it survives the whole interaction).
  const [active, setActive] = createSignal<ListKind | "">("");
  function currentKind(): ListKind | "" {
    if (document.queryCommandState("insertUnorderedList")) return "bullet";
    if (!document.queryCommandState("insertOrderedList")) return "";
    const node = window.getSelection()?.anchorNode;
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
    const ol = el?.closest?.("ol");
    // listAlpha() marks its list with both the class and the inline style.
    return ol?.classList.contains("listloweralpha") ? "alpha" : "number";
  }

  function toggle() {
    if (props.disabled) return;
    if (!open()) setActive(currentKind());
    toggleOpen();
  }

  const itemClass = (kind: ListKind) =>
    "flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-elevated transition-colors text-left " +
    (active() === kind ? "text-accent font-semibold" : "text-txt");

  function select(kind: ListKind) {
    props.onSelect(kind);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        title={t("editor.list_toolbar_title")}
        disabled={props.disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        class={
          "px-1.5 py-0.5 rounded transition-colors " +
          (props.disabled
            ? "text-muted/40 cursor-not-allowed"
            : `text-txt hover:bg-elevated ${open() ? "bg-elevated" : ""}`)
        }
      >
        <MdOutlineFormat_list_bulleted class="w-4 h-4" />
      </button>

      <Show when={open()}>
        <div
          ref={setPanelRef}
          class="z-50 w-44 py-1 bg-surface border border-rim rounded-lg shadow-xl flex flex-col"
          style={floatStyle()}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select("bullet")}
            class={itemClass("bullet")}
          >
            <MdOutlineFormat_list_bulleted class="w-4 h-4 shrink-0" />
            {t("editor.bullet_list")}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select("number")}
            class={itemClass("number")}
          >
            <MdOutlineFormat_list_numbered class="w-4 h-4 shrink-0" />
            {t("editor.numbered_list")}
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select("alpha")}
            class={itemClass("alpha")}
          >
            <span class="w-4 h-4 shrink-0 flex items-center justify-center text-[0.625rem] font-semibold">abc</span>
            {t("editor.lettered_list")}
          </button>
        </div>
      </Show>
    </>
  );
}
