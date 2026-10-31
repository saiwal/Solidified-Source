/**
 * Floating row/column controls for the table the caret is in.
 *
 * Plain DOM edits on the live surface, then RichEditor's onChange records the
 * result (one undo step each) and puts the caret in `focus`. New cells hold a
 * <br> so they keep a line's height and can take the caret; htmlToSource
 * serializes that as an empty [td][/td].
 */

import { Portal } from "solid-js/web";
import { createMemo } from "solid-js";
import {
  TbOutlineColumnInsertLeft, TbOutlineColumnInsertRight, TbOutlineColumnRemove,
  TbOutlineRowInsertBottom, TbOutlineRowInsertTop, TbOutlineRowRemove, TbOutlineTableRow,
} from "solid-icons/tb";
import { MdOutlineDelete } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { IconButton } from "@ui/Button";

const emptyCell = (tag: "td" | "th") => {
  const c = document.createElement(tag);
  c.appendChild(document.createElement("br"));
  return c;
};

/** Swap a cell's tag (th ↔ td) keeping its contents. */
const retag = (cell: Element, tag: "td" | "th") => {
  const c = document.createElement(tag);
  c.append(...Array.from(cell.childNodes));
  cell.replaceWith(c);
  return c;
};

/** Add a row after `tr` (or before), with as many cells as it has. */
export function addRow(tr: HTMLTableRowElement, before: boolean): HTMLTableRowElement {
  const row = document.createElement("tr");
  for (let i = 0; i < tr.cells.length; i++) row.appendChild(emptyCell("td"));
  tr.parentNode!.insertBefore(row, before ? tr : tr.nextSibling);
  return row;
}

export interface TableToolsProps {
  cell: HTMLTableCellElement;
  /** Record the edit; place the caret in `focus` (null: the table is gone). */
  onChange: (focus: Element | null) => void;
}

export default function TableTools(props: TableToolsProps) {
  const { t } = useI18n();
  const table = () => props.cell.closest("table")!;
  const rows = () => Array.from(table().rows);
  const tr = () => props.cell.parentElement as HTMLTableRowElement;
  const col = () => props.cell.cellIndex;

  const rect = createMemo(() => (props.cell, table().getBoundingClientRect()));
  const style = () => {
    const r = rect();
    return r.top > 56
      ? { left: `${Math.max(8, r.left)}px`, top: `${r.top - 6}px`, transform: "translateY(-100%)" }
      : { left: `${Math.max(8, r.left)}px`, top: `${r.bottom + 6}px` };
  };

  const rowAt = (before: boolean) => props.onChange(addRow(tr(), before).cells[col()] ?? null);

  const colAt = (before: boolean) => {
    let focus: Element | null = null;
    for (const row of rows()) {
      const ref = row.cells[col()];
      const c = emptyCell(ref?.tagName === "TH" ? "th" : "td");
      row.insertBefore(c, before ? ref : ref?.nextSibling ?? null);
      if (row === tr()) focus = c;
    }
    props.onChange(focus);
  };

  const removeTable = () => {
    const tbl = table();
    // Leave somewhere for the caret: the block after, or a fresh line.
    const after = tbl.nextSibling ?? tbl.parentNode!.appendChild(document.createElement("div"));
    if (!after.firstChild && after.nodeType === 1) after.appendChild(document.createElement("br"));
    tbl.remove();
    props.onChange(after as Element);
  };

  const removeRow = () => {
    const all = rows();
    if (all.length === 1) return removeTable();
    const i = all.indexOf(tr());
    tr().remove();
    props.onChange(all[i + 1]?.cells[col()] ?? all[i - 1]?.cells[col()] ?? null);
  };

  const removeCol = () => {
    if (tr().cells.length === 1) return removeTable();
    const i = col();
    for (const row of rows()) row.cells[i]?.remove();
    props.onChange(tr().cells[i] ?? tr().cells[i - 1] ?? null);
  };

  // The first row is the header when all of its cells are <th>.
  const toggleHeader = () => {
    const first = rows()[0];
    const isHeader = Array.from(first.cells).every((c) => c.tagName === "TH");
    let focus: Element | null = null;
    for (const c of Array.from(first.cells)) {
      const n = retag(c, isHeader ? "td" : "th");
      if (c === props.cell) focus = n;
    }
    props.onChange(focus ?? props.cell);
  };

  const Btn = (p: { label: string; onPress: () => void; children: any }) => (
    <IconButton label={p.label} size="sm" onMouseDown={(e) => { e.preventDefault(); p.onPress(); }}
      onClick={(e) => { if (e.detail === 0) p.onPress(); }}>
      {p.children}
    </IconButton>
  );

  return (
    <Portal mount={topLayer()}>
      <div
        data-editor-popup
        role="toolbar"
        aria-label={t("editor.table")}
        class="fixed z-[70] flex flex-wrap items-center gap-0.5 px-1 py-0.5 rounded-lg border border-rim bg-surface shadow-xl max-w-[calc(100vw-16px)]"
        style={style()}
      >
        <Btn label={t("editor.table_row_above")} onPress={() => rowAt(true)}><TbOutlineRowInsertTop class="w-4 h-4" /></Btn>
        <Btn label={t("editor.table_row_below")} onPress={() => rowAt(false)}><TbOutlineRowInsertBottom class="w-4 h-4" /></Btn>
        <Btn label={t("editor.table_col_left")} onPress={() => colAt(true)}><TbOutlineColumnInsertLeft class="w-4 h-4" /></Btn>
        <Btn label={t("editor.table_col_right")} onPress={() => colAt(false)}><TbOutlineColumnInsertRight class="w-4 h-4" /></Btn>
        <span class="w-px h-4 bg-rim mx-0.5" />
        <Btn label={t("editor.table_delete_row")} onPress={removeRow}><TbOutlineRowRemove class="w-4 h-4" /></Btn>
        <Btn label={t("editor.table_delete_col")} onPress={removeCol}><TbOutlineColumnRemove class="w-4 h-4" /></Btn>
        <Btn label={t("editor.table_header_row")} onPress={toggleHeader}><TbOutlineTableRow class="w-4 h-4" /></Btn>
        <Btn label={t("editor.table_delete")} onPress={removeTable}><MdOutlineDelete class="w-4 h-4" /></Btn>
      </div>
    </Portal>
  );
}
