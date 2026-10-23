// solidified's implementation of the list-row contract
// (spa-core types/ui.types.ts). One row shell: leading slot, text stack, trailing
// slot; renders a link, a button, or a static row depending on the props.
import { Show } from "solid-js";
import type { ListRowProps } from "@utsukta/spa-core/types/ui.types";

export function ListRow(props: ListRowProps) {
  const interactive = () => !!(props.href || props.onClick);
  const rowClass = () =>
    `hz-row flex items-start gap-3 px-3 py-2 transition-colors ${interactive() ? "hover:bg-elevated" : ""} ${props.class ?? ""}`;

  const body = (
    <>
      <Show when={props.leading}>
        <span class="shrink-0">{props.leading}</span>
      </Show>
      <span class="min-w-0 flex-1">
        <span class="block text-sm text-txt leading-snug">{props.title}</span>
        <Show when={props.subtitle}>
          <span class="block text-xs text-muted mt-0.5">{props.subtitle}</span>
        </Show>
        <Show when={props.meta}>
          <span class="block text-[0.625rem] text-muted mt-0.5">{props.meta}</span>
        </Show>
      </span>
      <Show when={props.trailing}>
        <span class="shrink-0">{props.trailing}</span>
      </Show>
    </>
  );

  if (props.href) {
    return <a href={props.href} class={rowClass()}>{body}</a>;
  }
  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} class={`${rowClass()} w-full text-left`}>
        {body}
      </button>
    );
  }
  return <div class={rowClass()}>{body}</div>;
}
