// solidified's implementation of the switch contract (spa-core types/ui.types.ts).
// A native checkbox with role="switch": Space, label clicks and form submission
// come from the browser, and screen readers announce on/off.
import { Show, createUniqueId, splitProps } from "solid-js";
import type { SwitchProps, ToggleProps } from "@utsukta/spa-core/types/ui.types";

export const switchClass =
  "hz-switch appearance-none relative h-6 w-11 shrink-0 cursor-pointer rounded-full " +
  "bg-elevated border border-rim transition-colors checked:bg-accent checked:border-accent " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "after:absolute after:top-1/2 after:-translate-y-1/2 after:translate-x-1 " +
  "after:h-4 after:w-4 after:rounded-full after:bg-muted " +
  "after:transition-transform after:duration-150 motion-reduce:after:transition-none " +
  "checked:after:translate-x-6 checked:after:bg-accent-fg " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export function Switch(props: SwitchProps) {
  const [own, rest] = splitProps(props, ["checked", "value", "onChange", "label", "class"]);
  return (
    <input
      type="checkbox"
      role="switch"
      value={own.value ?? "1"}
      checked={!!own.checked}
      aria-label={own.label}
      onChange={(e) => {
        const el = e.currentTarget;
        const r = own.onChange?.(el.checked);
        // The DOM flipped itself; if an async handler didn't move `checked`
        // (permission refused, request failed), put it back.
        if (r instanceof Promise) void r.finally(() => { el.checked = !!props.checked; });
      }}
      class={`${switchClass} ${own.class ?? ""}`}
      {...rest}
    />
  );
}

export function Toggle(props: ToggleProps) {
  const [own, rest] = splitProps(props, ["label", "hint", "class"]);
  const hintId = createUniqueId();
  return (
    <label class={`hz-toggle flex items-center justify-between gap-4 py-2.5 cursor-pointer select-none ${own.class ?? ""}`}>
      <span class="min-w-0">
        <span class="block text-sm text-txt">{own.label}</span>
        <Show when={own.hint}>
          <span id={hintId} class="block text-xs text-muted">{own.hint}</span>
        </Show>
      </span>
      <Switch aria-describedby={own.hint ? hintId : undefined} {...rest} />
    </label>
  );
}
