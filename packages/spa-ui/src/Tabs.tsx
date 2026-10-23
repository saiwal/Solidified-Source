// solidified's implementation of the tabs contract (spa-core types/ui.types.ts).
// Selection follows focus (automatic activation): the arrow keys pick the next
// tab, and only the selected tab sits in the Tab order.
import { For, Show } from "solid-js";
import type { TabPanelProps, TabsProps } from "@utsukta/spa-core/types/ui.types";
import { CountBadge } from "@ui/Badge";

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const tabId = (tabs: string, value: string) => `${tabs}-tab-${value}`;
const panelId = (tabs: string, value: string) => `${tabs}-panel-${value}`;

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
              id={props.id ? tabId(props.id, item.value) : undefined}
              aria-controls={props.id ? panelId(props.id, item.value) : undefined}
              onClick={() => props.onChange(item.value)}
              class={
                segmented()
                  ? `hz-tab inline-flex items-center justify-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${focus} ` +
                    `${props.stretch ? "flex-1 " : ""}` +
                    (on() ? "bg-accent text-accent-fg font-semibold" : "text-muted hover:text-txt")
                  : `hz-tab relative shrink-0 inline-flex items-center gap-1.5 pb-2 text-sm transition-colors duration-300 ${focus} ` +
                    (on() ? "text-txt" : "text-muted hover:text-txt")
              }
            >
              <Show when={item.icon}>
                <span class="shrink-0" aria-hidden="true">{item.icon}</span>
              </Show>
              {item.label}
              {/* On the selected segmented tab the bubble would vanish into the accent fill; invert it. */}
              <CountBadge n={item.count ?? 0} class={on() && segmented() ? "bg-accent-fg! text-accent!" : ""} />
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

export function TabPanel<T extends string>(props: TabPanelProps<T>) {
  return (
    <div
      role="tabpanel"
      id={panelId(props.tabs, props.value)}
      aria-labelledby={tabId(props.tabs, props.value)}
      tabIndex={0}
      class={`hz-tabpanel rounded-md ${focus} ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
}
