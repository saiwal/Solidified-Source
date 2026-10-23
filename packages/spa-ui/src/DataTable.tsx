// solidified's implementation of the data-table contract
// (spa-core types/ui.types.ts). Controlled sort: the call site owns the sort
// state and re-orders `rows`; this renders aria-sort and the header buttons.
import { For, Show } from "solid-js";
import type { DataTableProps } from "@utsukta/spa-core/types/ui.types";

export function DataTable<T>(props: DataTableProps<T>) {
  const sortedDir = (key: string) =>
    props.sort?.key === key ? props.sort.dir : undefined;

  return (
    <div class={`hz-table overflow-x-auto ${props.class ?? ""}`}>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-rim bg-elevated">
            <For each={props.columns}>
              {(col) => (
                <th
                  scope="col"
                  aria-sort={
                    sortedDir(col.key)
                      ? sortedDir(col.key) === "asc" ? "ascending" : "descending"
                      : undefined
                  }
                  class={`px-3 py-2 text-left text-xs font-medium text-muted ${col.class ?? ""}`}
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
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <Show
            when={props.rows.length > 0}
            fallback={
              <tr>
                <td colSpan={props.columns.length} class="px-3 py-8 text-center text-sm text-muted">
                  {props.empty}
                </td>
              </tr>
            }
          >
            <For each={props.rows}>
              {(row) => (
                <tr
                  data-row-key={props.rowKey(row)}
                  class={`border-b border-rim last:border-0 ${props.onRowClick ? "cursor-pointer hover:bg-elevated" : ""}`}
                  role={props.onRowClick ? "button" : undefined}
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
                    {(col) => <td class={`px-3 py-2 ${col.class ?? ""}`}>{col.cell(row)}</td>}
                  </For>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  );
}
