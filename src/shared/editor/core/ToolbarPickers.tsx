/**
 * ToolbarPickers.tsx
 *
 * Dropdown panels for the EditorToolbar's colour / size / font buttons, which
 * used to collect their value through window.prompt(). Same dropdown shell as
 * EmojiPicker (useDropdown + a floating panel), so the toolbar has one popup
 * behaviour rather than two.
 *
 * Selection safety: the toolbar restores the editor's last range before every
 * exec (EditorToolbar's lastRange/focusEditor), so opening a panel is fine.
 * Option buttons still fire on mousedown with preventDefault, matching Btn —
 * that keeps the contenteditable selection visible while the panel is open.
 */

import { For, Show, type JSX } from "solid-js";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";

const PANEL =
  "z-50 bg-surface border border-rim rounded-xl shadow-xl p-2 max-h-72 overflow-y-auto";

function triggerClass(open: boolean) {
  return `px-1.5 py-0.5 rounded text-txt hover:bg-elevated transition-colors ${
    open ? "bg-elevated" : ""
  }`;
}

/** Fires on mousedown so the editor selection survives the click. */
function press(fn: () => void) {
  return (e: MouseEvent) => {
    e.preventDefault();
    fn();
  };
}

// ── Colour ───────────────────────────────────────────────────────────────────

// Tailwind-500 hues plus black/white: readable on both the light and the dark
// themes whether used as text colour or as a highlight.
const SWATCHES = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#78716c",
  "#000000", "#525252", "#a3a3a3", "#ffffff",
];

export function ColorPicker(props: {
  title: string;
  icon: JSX.Element;
  onPick: (color: string) => void;
  /** Rendered above the swatches — highlight uses it to clear the mark. */
  clearLabel?: string;
  onClear?: () => void;
}) {
  const { open, toggle, setOpen, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start", offset: 4 });

  const pick = (c: string) => {
    props.onPick(c);
    setOpen(false);
  };

  return (
    <>
      <button ref={setTriggerRef} type="button" title={props.title}
              onClick={toggle} class={triggerClass(open())}>
        {props.icon}
      </button>

      <Show when={open()}>
        <div ref={setPanelRef} class={`${PANEL} w-52`} style={floatStyle()}>
          <Show when={props.onClear}>
            <button type="button"
                    onMouseDown={press(() => { props.onClear!(); setOpen(false); })}
                    class="w-full mb-2 px-2 py-1 text-xs rounded text-txt hover:bg-elevated text-left">
              {props.clearLabel}
            </button>
          </Show>

          <div class="grid grid-cols-8 gap-1">
            <For each={SWATCHES}>
              {(c) => (
                <button type="button" title={c} onMouseDown={press(() => pick(c))}
                        style={{ "background-color": c }}
                        class="w-5 h-5 rounded border border-rim hover:scale-110 transition-transform" />
              )}
            </For>
          </div>

          {/* The OS colour dialog outlives a click, and useDropdown closes the
              panel on any document click — which would unmount this input
              before its change event ever fired. stopPropagation keeps the
              panel open until a colour actually comes back. */}
          <label class="mt-2 flex items-center gap-2 px-1 text-xs text-muted cursor-pointer">
            <input type="color" class="w-6 h-6 bg-transparent cursor-pointer"
                   onClick={(e) => e.stopPropagation()}
                   onChange={(e) => pick(e.currentTarget.value)} />
            <span>Custom…</span>
          </label>
        </div>
      </Show>
    </>
  );
}

// ── Prompt panel ─────────────────────────────────────────────────────────────

export interface PromptField {
  key: string;
  label: string;
  /** Prefilled value; also what the field resets to each time the panel opens. */
  value?: string;
  type?: "text" | "number";
}

/**
 * A small labelled-input panel, replacing window.prompt() for the toolbar's
 * insert buttons (link, media, table, spoiler, quote author).
 *
 * prompt() blurs the contenteditable and drops its selection — which is the
 * entire reason link() used to carry a manual range save/restore around it —
 * is unstyled, and is blocked outright in sandboxed iframes. This panel
 * renders inside the toolbar, which RichEditor's blur guard already treats as
 * "focus is still in the editor", so the surface is not re-rendered underneath
 * it and the toolbar's own lastRange/focusEditor restores the caret on submit.
 *
 * A <div> rather than a <form>: composers are mounted inside real forms in
 * places (EventCreatorModal, ProfileEditView) and the parser drops a nested
 * form, so Enter is handled by hand instead.
 */
export function PromptPanel(props: {
  title: string;
  icon: JSX.Element;
  fields: PromptField[];
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const { open, toggle, setOpen, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start", offset: 4 });

  const inputs = new Map<string, HTMLInputElement>();

  const submit = () => {
    props.onSubmit(
      Object.fromEntries(props.fields.map((f) => [f.key, inputs.get(f.key)?.value.trim() ?? ""])),
    );
    setOpen(false);
  };

  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        title={props.title}
        disabled={props.disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (!props.disabled) toggle(); }}
        class={
          props.disabled
            ? "px-1.5 py-0.5 rounded text-muted/40 cursor-not-allowed"
            : triggerClass(open())
        }
      >
        {props.icon}
      </button>

      <Show when={open()}>
        <div
          ref={setPanelRef}
          class={`${PANEL} w-60 flex flex-col gap-2`}
          style={floatStyle()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <For each={props.fields}>
            {(f, i) => (
              <label class="flex flex-col gap-1 text-xs text-muted">
                {f.label}
                <input
                  ref={(el) => {
                    inputs.set(f.key, el);
                    // Straight into the first field, so the panel costs the
                    // same keystrokes prompt() did.
                    if (i() === 0) queueMicrotask(() => el.focus());
                  }}
                  type={f.type ?? "text"}
                  value={f.value ?? ""}
                  class="px-2 py-1 text-xs rounded border border-rim bg-elevated text-txt
                         outline-none focus:border-accent/50"
                />
              </label>
            )}
          </For>
          <button
            type="button"
            onClick={submit}
            class="self-end px-2.5 py-1 text-xs font-semibold rounded bg-accent text-accent-fg hover:opacity-90"
          >
            {props.submitLabel}
          </button>
        </div>
      </Show>
    </>
  );
}

// ── Size / font ──────────────────────────────────────────────────────────────

export interface MenuOption {
  /** The bbcode attribute value, e.g. "large" or "monospace". */
  value: string;
  /** Inline style previewing the option, so the row shows what it does. */
  preview: JSX.CSSProperties;
}

/**
 * Option list where each row is rendered in the style it applies. The values
 * are CSS keywords, which are not translated — so the preview *is* the label
 * and no locale keys are needed for the options themselves.
 */
export function OptionMenu(props: {
  title: string;
  icon: JSX.Element;
  options: MenuOption[];
  onPick: (value: string) => void;
}) {
  const { open, toggle, setOpen, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start", offset: 4 });

  return (
    <>
      <button ref={setTriggerRef} type="button" title={props.title}
              onClick={toggle} class={triggerClass(open())}>
        {props.icon}
      </button>

      <Show when={open()}>
        <div ref={setPanelRef} class={`${PANEL} w-44`} style={floatStyle()}>
          <For each={props.options}>
            {(o) => (
              <button type="button"
                      onMouseDown={press(() => { props.onPick(o.value); setOpen(false); })}
                      class="w-full flex items-baseline justify-between gap-2 px-2 py-1
                             rounded text-txt hover:bg-elevated text-left">
                <span style={o.preview}>Aa</span>
                <span class="text-[0.625rem] text-muted shrink-0">{o.value}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

// Keywords, not px: htmlToSource already round-trips <font size> through this
// exact vocabulary (its sizeMap), and they scale with the reader's font size.
// "x-small" is deliberately absent: execCommand("fontSize") only speaks the
// legacy 1-7 scale, which has no x-small slot, so it and "small" both mapped to
// 2 and htmlToSource's sizeMap read 2 back as "small" — picking x-small
// silently gave you small.
export const SIZE_OPTIONS: MenuOption[] = [
  "xx-small", "small", "medium", "large", "x-large", "xx-large",
].map((v) => ({ value: v, preview: { "font-size": v } }));

// Generic CSS families — every platform resolves these to something sensible,
// where a named font would silently fall back to the default off-platform.
export const FONT_OPTIONS: MenuOption[] = [
  "sans-serif", "serif", "monospace", "cursive", "fantasy",
].map((v) => ({ value: v, preview: { "font-family": v } }));
