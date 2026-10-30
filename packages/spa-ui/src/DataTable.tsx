// solidified's implementation of the data-table contract
// (spa-core types/ui.types.ts). Controlled sort: the call site owns the sort
// state and re-orders `rows`; this renders aria-sort and the header buttons.
//
// Flex rows with ARIA table roles rather than a <table>: a table can only
// hide columns or scroll when it runs out of width, these rows fold instead.
// Wide, every cell gets its column's fixed basis so the columns line up under
// the header; folded (container narrower than the columns need), the header
// hides: the first column and any unlabelled (actions) cells share the top
// line, then a flex-order line break, then the rest wrap as `label value`.
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { DataTableColumn, DataTableProps } from "@utsukta/spa-core/types/ui.types";

const FLEX_MIN = 10; // rem a width-less column needs before the row folds

export function DataTable<T>(props: DataTableProps<T>) {
  const sortedDir = (key: string) =>
    props.sort?.key === key ? props.sort.dir : undefined;

  let el!: HTMLDivElement;
  const [folded, setFolded] = createSignal(false);
  onMount(() => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const fit = (width: number) => {
      const need = props.columns.reduce((sum, c) => sum + (c.width ?? FLEX_MIN), 0) * rem;
      setFolded(width < need);
    };
    fit(el.clientWidth);
    const ro = new ResizeObserver(([e]) => fit(e.contentRect.width));
    ro.observe(el);
    onCleanup(() => ro.disconnect());
  });

  const basis = (col: DataTableColumn<T>) =>
    col.width ? `0 0 ${col.width}rem` : "1 1 0%";

  return (
    <div ref={el} role="table" class={`hz-table text-sm ${props.class ?? ""}`}>
      <Show when={!folded()}>
        <div role="rowgroup">
          <div role="row" class="flex border-b border-rim bg-elevated">
            <For each={props.columns}>
              {(col) => (
                <div
                  role="columnheader"
                  aria-sort={
                    sortedDir(col.key)
                      ? sortedDir(col.key) === "asc" ? "ascending" : "descending"
                      : undefined
                  }
                  style={{ flex: basis(col) }}
                  class="min-w-0 px-3 py-2 text-left text-xs font-medium text-muted"
                >
                  <Show when={col.sortable && props.onSort} fallback={col.header}>
                    <button
                      type="button"
                      onClick={() => props.onSort?.(col.key)}
                      class="inline-flex items-center gap-1 hover:text-txt transition-colors"
                    >
                      {col.header}
                      <span aria-hidden="true">
                        {sortedDir(col.key) === "asc" ? "▲" : sortedDir(col.key) === "desc" ? "▼" : "↕"}
                      </span>
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div role="rowgroup">
        <Show
          when={props.rows.length > 0}
          fallback={
            <div role="row">
              <div role="cell" class="px-3 py-8 text-center text-sm text-muted">
                {props.empty}
              </div>
            </div>
          }
        >
          <For each={props.rows}>
            {(row) => (
              <div
                role="row"
                data-row-key={props.rowKey(row)}
                class={`flex border-b border-rim last:border-0 ${
                  folded() ? "flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5" : "items-center"
                } ${props.onRowClick ? "cursor-pointer hover:bg-elevated" : ""}`}
                tabIndex={props.onRowClick ? 0 : undefined}
                onClick={() => props.onRowClick?.(row)}
                onKeyDown={(e) => {
                  if (!props.onRowClick) return;
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  props.onRowClick(row);
                }}
              >
                <For each={props.columns}>
                  {(col, i) => (
                    <Show
                      when={folded()}
                      fallback={
                        <div role="cell" style={{ flex: basis(col) }} class={`min-w-0 px-3 py-2 ${col.class ?? ""}`}>
                          {col.cell(row)}
                        </div>
                      }
                    >
                      <Show
                        when={i() > 0 && col.header}
                        fallback={
                          <div role="cell" class={`min-w-0 ${i() === 0 ? "order-0 flex-1" : "order-1"} ${col.class ?? ""}`}>
                            {col.cell(row)}
                          </div>
                        }
                      >
                        <div role="cell" class="order-3 flex min-w-0 max-w-full items-baseline gap-1.5 text-xs">
                          <span class="shrink-0 text-muted">{col.header}</span>
                          <div class={`min-w-0 ${col.class ?? ""}`}>{col.cell(row)}</div>
                        </div>
                      </Show>
                    </Show>
                  )}
                </For>
                <Show when={folded()}>
                  <div aria-hidden="true" class="order-2 basis-full" />
                </Show>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
