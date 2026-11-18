/**
 * AutosizeTextarea.tsx
 * A <textarea> that grows with its content up to `maxLines` (default 5),
 * computed from the element's actual computed line-height so it's correct
 * regardless of the font-size class a caller applies — then keeps
 * `overflow-y: auto` and stops growing.
 *
 * Uses JS scrollHeight measurement (generalizing the pattern already used
 * locally in src/modules/hq/widgets/HqComposer.tsx) rather than CSS
 * `field-sizing: content`, which is Chromium-only today and still needs a
 * manual max-height clamp to cap growth at N lines.
 */

import { onSettled, type Component, createEffect } from "solid-js";

export interface AutosizeTextareaProps {
  value: () => string;
  onInput: (v: string) => void;
  placeholder?: string;
  /** Maximum visible lines before the textarea scrolls internally. Default 5. */
  maxLines?: number;
  rows?: number;
  class?: string;
}

const AutosizeTextarea: Component<AutosizeTextareaProps> = (props) => {
  let ref: HTMLTextAreaElement | undefined;

  function resize() {
    if (!ref) return;
    const style = window.getComputedStyle(ref);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;
    const maxLines = props.maxLines ?? 5;
    const maxHeight =
      lineHeight * maxLines + paddingTop + paddingBottom + borderTop + borderBottom;

    ref.style.height = "auto";
    const next = Math.min(ref.scrollHeight, maxHeight);
    ref.style.height = `${next}px`;
    ref.style.overflowY = ref.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  onSettled(() => { void (resize)(); });
  createEffect(() => props.value(), () => {
    resize();
  });

  return (
    <textarea
      ref={(el) => { ref = el; }}
      value={props.value()}
      onInput={(e) => {
        props.onInput(e.currentTarget.value);
        resize();
      }}
      placeholder={props.placeholder}
      rows={props.rows ?? 1}
      class={props.class}
    />
  );
};

export default AutosizeTextarea;
