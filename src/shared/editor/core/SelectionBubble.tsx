/**
 * The few formatting buttons you reach for most, floating by a text
 * selection on the WYSIWYG surface. EditorToolbar owns it and hands it its own
 * actions, so a bubble button and the bottom-bar button are the same code —
 * same undo step, same lit state.
 *
 * On touch screens it sits below the selection: iOS and Android draw their own
 * copy/paste menu above it.
 */

import { Portal } from "solid-js/web";
import { For, Show, createSignal, type JSX } from "solid-js";
import { MdOutlineLink } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { IconButton, Button } from "@ui/Button";
import { Input } from "@ui/Field";

export interface BubbleItem {
  label: string;
  icon: JSX.Element;
  onPress: () => void;
  active?: boolean;
}

export interface SelectionBubbleProps {
  rect: DOMRect;
  items: BubbleItem[];
  /** Given, a link button opens a URL field in the bubble itself. */
  onLink?: (url: string) => void;
}

const COARSE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export default function SelectionBubble(props: SelectionBubbleProps) {
  const { t } = useI18n();
  const [linking, setLinking] = createSignal(false);
  const [url, setUrl] = createSignal("");
  let box: HTMLDivElement | undefined;

  // Centred on the selection, clamped into the viewport. Above it with a
  // mouse (where it doesn't cover what you're reading next), below on touch.
  const style = () => {
    const r = props.rect;
    const w = box?.offsetWidth ?? 280;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = COARSE || r.top < 56;
    return below
      ? { left: `${left}px`, top: `${r.bottom + (COARSE ? 28 : 8)}px` }
      : { left: `${left}px`, top: `${r.top - 8}px`, transform: "translateY(-100%)" };
  };

  // Mouse acts on mousedown so the editor keeps its selection; keyboard on click.
  const press = (fn: () => void) => (e: MouseEvent) => { e.preventDefault(); fn(); };
  const key = (fn: () => void) => (e: MouseEvent) => { if (e.detail === 0) fn(); };

  const submitLink = () => {
    if (url().trim()) props.onLink?.(url().trim());
    setLinking(false);
    setUrl("");
  };

  return (
    <Portal mount={topLayer()}>
      <div
        ref={box}
        data-editor-popup
        role="toolbar"
        aria-label={t("editor.toolbar_label")}
        class="fixed z-[70] flex items-center gap-0.5 px-1 py-0.5 rounded-lg border border-rim bg-surface shadow-xl max-w-[calc(100vw-16px)]"
        style={style()}
      >
        <Show
          when={linking()}
          fallback={
            <>
              <For each={props.items}>
                {(it) => (
                  <IconButton label={it.label} size="sm" pressed={it.active}
                    onMouseDown={press(it.onPress)} onClick={key(it.onPress)}>
                    {it.icon}
                  </IconButton>
                )}
              </For>
              <Show when={props.onLink}>
                <IconButton label={t("editor.link")} size="sm"
                  onMouseDown={press(() => setLinking(true))} onClick={key(() => setLinking(true))}>
                  <MdOutlineLink class="w-4 h-4" />
                </IconButton>
              </Show>
            </>
          }
        >
          <div
            class="flex items-center gap-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submitLink(); }
              if (e.key === "Escape") { e.stopPropagation(); setLinking(false); }
            }}
          >
            <Input size="sm" class="w-52" aria-label={t("editor.url_label")} placeholder="https://"
              value={url()} onInput={(e) => setUrl(e.currentTarget.value)}
              ref={(el) => queueMicrotask(() => el.focus())} />
            <Button size="sm" onClick={submitLink}>{t("editor.insert")}</Button>
          </div>
        </Show>
      </div>
    </Portal>
  );
}
