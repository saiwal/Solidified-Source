/**
 * OutlineDropdown.tsx
 * "Contents" for a long document: the WYSIWYG surface's headings, indented by
 * level, with the one the caret is under marked. Picking one scrolls there
 * and puts the caret at its start. Read from the live DOM on open — a
 * snapshot, so it never re-walks the document while you type.
 */

import { For, Show, createSignal } from "solid-js";
import { MdOutlineToc } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { IconButton } from "@ui/Button";

const HEADINGS = "h1, h2, h3, h4, h5, h6";

/** How many headings the surface has — the toolbar shows the button from 3. */
export const headingCount = (surface: HTMLElement | undefined) =>
  surface?.querySelectorAll(HEADINGS).length ?? 0;

interface Entry { el: HTMLElement; level: number; text: string }

export default function OutlineDropdown(props: { editorRef: () => HTMLDivElement | undefined; title: string }) {
  const { t } = useI18n();
  const { open, setOpen, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-end", offset: 4 });
  const [entries, setEntries] = createSignal<Entry[]>([]);
  const [active, setActive] = createSignal(-1);

  const read = () => {
    const surface = props.editorRef();
    if (!surface) return;
    const list = Array.from(surface.querySelectorAll<HTMLElement>(HEADINGS)).map((el) => ({
      el,
      level: Number(el.tagName[1]),
      text: (el.textContent ?? "").replace(/​/g, "").trim() || "…",
    }));
    // The caret's section: the last heading that starts before it.
    const sel = window.getSelection();
    const caret = sel?.rangeCount ? sel.getRangeAt(0).startContainer : null;
    let at = -1;
    if (caret && surface.contains(caret)) {
      list.forEach((h, i) => {
        if (h.el === caret || h.el.contains(caret) || h.el.compareDocumentPosition(caret) & Node.DOCUMENT_POSITION_FOLLOWING) at = i;
      });
    }
    setEntries(list);
    setActive(at);
  };

  const jump = (h: Entry) => {
    setOpen(false);
    if (!h.el.isConnected) return;
    props.editorRef()?.focus();
    const r = document.createRange();
    r.selectNodeContents(h.el);
    r.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
    h.el.scrollIntoView({ block: "start" });
  };

  // Shallowest level present sits flush left, so an outline of only H2/H3
  // doesn't start indented.
  const base = () => Math.min(...entries().map((e) => e.level));

  return (
    <>
      <IconButton
        label={props.title}
        size="sm"
        aria-expanded={open()}
        class={open() ? "bg-elevated text-txt" : ""}
        ref={setTriggerRef}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (!open()) read(); toggle(); }}
      >
        <MdOutlineToc class="w-4 h-4" />
      </IconButton>

      <Show when={open()}>
        <nav
          ref={setPanelRef}
          aria-label={t("editor.outline")}
          class="z-50 w-64 max-w-[calc(100vw-16px)] max-h-80 overflow-y-auto py-1 bg-surface border border-rim rounded-lg shadow-xl flex flex-col"
          style={floatStyle()}
        >
          <For each={entries()}>
            {(h, i) => (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => jump(h)}
                aria-current={i() === active() ? "location" : undefined}
                style={{ "padding-left": `${0.75 + (h.level - base()) * 0.75}rem` }}
                class={`pr-3 py-1.5 text-xs text-left truncate hover:bg-elevated transition-colors ${
                  i() === active() ? "text-accent-txt font-semibold" : h.level === base() ? "text-txt" : "text-muted"
                }`}
              >
                {h.text}
              </button>
            )}
          </For>
        </nav>
      </Show>
    </>
  );
}
