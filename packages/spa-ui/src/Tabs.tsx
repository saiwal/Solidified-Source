// solidified's implementation of the tabs contract (spa-core types/ui.types.ts).
// Selection follows focus (automatic activation): the arrow keys pick the next
// tab, and only the selected tab sits in the Tab order.
import { For } from "solid-js";
import type { TabsProps } from "@utsukta/spa-core/types/ui.types";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function Tabs<T extends string>(props: TabsProps<T>) {
  let list!: HTMLDivElement;
  const segmented = () => props.variant !== "underline";

  const onKeyDown = (e: KeyboardEvent) => {
    const values = props.items.map((i) => i.value);
    const i = values.indexOf(props.value);
    const next =
      e.key === "ArrowRight" ? (i + 1) % values.length
      : e.key === "ArrowLeft" ? (i - 1 + values.length) % values.length
      : e.key === "Home" ? 0
      : e.key === "End" ? values.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    props.onChange(values[next]);
    queueMicrotask(() => list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus());
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={props.label}
      onKeyDown={onKeyDown}
      class={`hz-tabs ${
        segmented()
          ? `hz-tabs-segmented flex gap-1 p-1 bg-elevated rounded-lg ${props.stretch ? "w-full" : "w-fit"}`
          : "hz-tabs-underline flex gap-6 overflow-x-auto [scrollbar-width:none]"
      } ${props.class ?? ""}`}
    >
      <For each={props.items}>
        {(item) => {
          const on = () => item.value === props.value;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={on()}
              tabIndex={on() ? 0 : -1}
              onClick={() => props.onChange(item.value)}
              class={
                segmented()
                  ? `hz-tab px-3 py-1 text-xs text-center rounded-md font-medium transition-colors ${focus} ` +
                    `${props.stretch ? "flex-1 " : ""}` +
                    (on() ? "bg-accent text-accent-fg font-semibold" : "text-muted hover:text-txt")
                  : `hz-tab relative shrink-0 pb-2 text-sm transition-colors duration-300 ${focus} ` +
                    (on() ? "text-txt" : "text-muted hover:text-txt")
              }
            >
              {item.label}
              {!segmented() && (
                <span
                  class={`absolute left-0 bottom-0 h-0.5 rounded-full bg-accent transition-all duration-300 ${on() ? "w-full" : "w-0"}`}
                />
              )}
            </button>
          );
        }}
      </For>
    </div>
  );
}
