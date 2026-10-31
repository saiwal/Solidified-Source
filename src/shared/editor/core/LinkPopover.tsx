/**
 * Shown while the caret is inside a link on the WYSIWYG surface: the URL
 * (opens in a new tab — the surface itself never follows links), Edit and
 * Unlink. Edits go straight onto the live <a>; RichEditor's onChange records
 * them as one undo step.
 */

import { Portal } from "solid-js/web";
import { Show, createSignal } from "solid-js";
import { MdOutlineEdit, MdOutlineLink_off, MdOutlineOpen_in_new } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { IconButton, Button } from "@ui/Button";
import { Input } from "@ui/Field";

/** Same rule as the toolbar's Insert link: a bare "example.org" gets https. */
export const normalizeUrl = (raw: string) =>
  /^([a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(raw) ? raw : `https://${raw}`;

export interface LinkPopoverProps {
  el: HTMLAnchorElement;
  onChange: () => void;
  onClose: () => void;
}

export default function LinkPopover(props: LinkPopoverProps) {
  const { t } = useI18n();
  const [editing, setEditing] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [text, setText] = createSignal("");

  const style = () => {
    const r = props.el.getBoundingClientRect();
    return r.bottom + 64 < window.innerHeight
      ? { left: `${Math.max(8, r.left)}px`, top: `${r.bottom + 6}px` }
      : { left: `${Math.max(8, r.left)}px`, top: `${r.top - 6}px`, transform: "translateY(-100%)" };
  };

  const startEdit = () => {
    setUrl(props.el.getAttribute("href") ?? "");
    setText(props.el.textContent ?? "");
    setEditing(true);
  };

  const save = () => {
    const u = url().trim();
    if (!u || /^\s*javascript:/i.test(u)) return;
    props.el.setAttribute("href", normalizeUrl(u));
    // Only rewrite the text when it changed: it may carry inner formatting.
    if (text().trim() && text() !== props.el.textContent) props.el.textContent = text().trim();
    setEditing(false);
    props.onChange();
  };

  const unlink = () => {
    props.el.replaceWith(...Array.from(props.el.childNodes));
    props.onChange();
    props.onClose();
  };

  // Mouse acts on mousedown so the editor keeps its caret; keyboard on click.
  const press = (fn: () => void) => (e: MouseEvent) => { e.preventDefault(); fn(); };

  return (
    <Portal mount={topLayer()}>
      <div
        data-editor-popup
        class="fixed z-[70] flex items-center gap-1 px-2 py-1 rounded-lg border border-rim bg-surface shadow-xl max-w-[calc(100vw-16px)]"
        style={style()}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); editing() ? setEditing(false) : props.onClose(); }
        }}
      >
        <Show
          when={editing()}
          fallback={
            <>
              <a
                href={props.el.href}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1 min-w-0 max-w-[16rem] text-xs text-accent-txt hover:underline"
                title={t("editor.link_open")}
              >
                <span class="truncate">{props.el.getAttribute("href")}</span>
                <MdOutlineOpen_in_new class="w-3.5 h-3.5 shrink-0" />
              </a>
              <IconButton label={t("editor.link_edit")} size="sm" onMouseDown={press(startEdit)} onClick={(e) => { if (e.detail === 0) startEdit(); }}>
                <MdOutlineEdit class="w-4 h-4" />
              </IconButton>
              <IconButton label={t("editor.link_unlink")} size="sm" onMouseDown={press(unlink)} onClick={(e) => { if (e.detail === 0) unlink(); }}>
                <MdOutlineLink_off class="w-4 h-4" />
              </IconButton>
            </>
          }
        >
          <div class="flex flex-wrap items-end gap-2" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}>
            <Input size="sm" class="w-48" aria-label={t("editor.url_label")} placeholder={t("editor.url_label")}
              value={url()} onInput={(e) => setUrl(e.currentTarget.value)} ref={(el) => queueMicrotask(() => el.focus())} />
            <Input size="sm" class="w-36" aria-label={t("editor.link_text")} placeholder={t("editor.link_text")}
              value={text()} onInput={(e) => setText(e.currentTarget.value)} />
            <Button size="sm" onClick={save}>{t("editor.link_save")}</Button>
          </div>
        </Show>
      </div>
    </Portal>
  );
}
