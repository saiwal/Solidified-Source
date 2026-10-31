/**
 * Find & replace for the WYSIWYG surface.
 *
 * Matches are painted with the CSS Custom Highlight API (`::highlight(hz-find)`
 * in index.css), which colours ranges *without touching the DOM* — wrapping
 * them in <mark>s would leak into htmlToSource and the saved body. Where the
 * API is missing only the current match is scrolled to.
 *
 * The search runs over the surface's text as one string, so a phrase still
 * matches when part of it is bold; non-editable embeds are skipped. Replacing
 * edits the live text nodes, then `onChange` records it — Replace all is one
 * undo step.
 */

import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { MdOutlineClose, MdOutlineKeyboard_arrow_down, MdOutlineKeyboard_arrow_up } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { IconButton, Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { findAll, locate, textIndex } from "./findText";

type HighlightRegistry = { set(k: string, v: unknown): void; delete(k: string): void };
const highlights = (): HighlightRegistry | null =>
  (globalThis as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights ?? null;
const Highlight = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

export interface FindReplaceProps {
  surface: HTMLElement;
  /** Seed for the find field — the editor's selected text. */
  initial: string;
  /** Ctrl+H: focus the replace field instead. */
  focusReplace: boolean;
  /** A replacement edited the surface: record it. */
  onChange: () => void;
  /** Closed; `at` is the current match, for the caret. */
  onClose: (at: Range | null) => void;
}

export default function FindReplace(props: FindReplaceProps) {
  const { t } = useI18n();
  const [query, setQuery] = createSignal(props.initial);
  const [replace, setReplace] = createSignal("");
  const [matchCase, setMatchCase] = createSignal(false);
  const [ranges, setRanges] = createSignal<Range[]>([]);
  const [cur, setCur] = createSignal(0);
  let findEl: HTMLInputElement | undefined;
  let replaceEl: HTMLInputElement | undefined;

  const search = () => {
    const { text, segs } = textIndex(props.surface);
    const q = query();
    const list = segs.length
      ? findAll(text, q, matchCase()).map((at) => {
          const r = document.createRange();
          r.setStart(...locate(segs, at, false));
          r.setEnd(...locate(segs, at + q.length, true));
          return r;
        })
      : [];
    setRanges(list);
    // Not via ranges(): this runs inside the query effect, which must not
    // come to depend on the signal it writes.
    setCur((c) => Math.min(c, Math.max(0, list.length - 1)));
  };

  createEffect(() => { query(); matchCase(); search(); });

  // Typing in the document while the bar is open moves every match.
  let raf = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(search);
  });
  onMount(() => {
    observer.observe(props.surface, { childList: true, subtree: true, characterData: true });
    (props.focusReplace ? replaceEl : findEl)?.focus();
    findEl?.select();
  });

  createEffect(() => {
    const reg = highlights();
    const all = ranges();
    const current = all[cur()];
    if (reg && Highlight) {
      reg.set("hz-find", new Highlight(...all));
      reg.set("hz-find-current", current ? new Highlight(current) : new Highlight());
    }
    const el = current?.startContainer.parentElement;
    el?.scrollIntoView({ block: "nearest" });
  });

  onCleanup(() => {
    observer.disconnect();
    cancelAnimationFrame(raf);
    highlights()?.delete("hz-find");
    highlights()?.delete("hz-find-current");
  });

  const step = (d: number) => {
    const n = ranges().length;
    if (n) setCur((c) => (c + d + n) % n);
  };

  const swap = (r: Range) => {
    r.deleteContents();
    if (replace()) r.insertNode(document.createTextNode(replace()));
  };

  const replaceOne = () => {
    const r = ranges()[cur()];
    if (!r) return;
    swap(r);
    props.onChange();
    search();
  };

  const replaceAll = () => {
    const all = ranges();
    if (!all.length) return;
    // Back to front, so earlier ranges stay valid while later text changes.
    for (const r of [...all].reverse()) swap(r);
    props.onChange();
    search();
  };

  const close = () => props.onClose(ranges()[cur()] ?? null);

  const count = () =>
    !query() ? "" : ranges().length ? t("editor.find_count", { n: String(cur() + 1), total: String(ranges().length) }) : t("editor.find_none");

  return (
    <div
      data-editor-popup
      role="search"
      class="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1.5 rounded-t-lg bg-elevated border-b border-rim"
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
      }}
    >
      <div class="flex items-center gap-1 min-w-0 flex-1 basis-56">
        <Input
          ref={findEl}
          size="sm"
          class="min-w-0 flex-1"
          aria-label={t("editor.find_placeholder")}
          placeholder={t("editor.find_placeholder")}
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } }}
        />
        <span class="text-xs text-muted tabular-nums whitespace-nowrap" aria-live="polite">{count()}</span>
        <IconButton label={t("editor.find_prev")} size="sm" onClick={() => step(-1)} disabled={!ranges().length}>
          <MdOutlineKeyboard_arrow_up class="w-4 h-4" />
        </IconButton>
        <IconButton label={t("editor.find_next")} size="sm" onClick={() => step(1)} disabled={!ranges().length}>
          <MdOutlineKeyboard_arrow_down class="w-4 h-4" />
        </IconButton>
        <Button
          variant="ghost"
          size="sm"
          pressed={matchCase()}
          title={t("editor.match_case")}
          aria-label={t("editor.match_case")}
          onClick={() => setMatchCase(!matchCase())}
        >
          Aa
        </Button>
      </div>
      <div class="flex items-center gap-1 min-w-0 flex-1 basis-56">
        <Input
          ref={replaceEl}
          size="sm"
          class="min-w-0 flex-1"
          aria-label={t("editor.replace_placeholder")}
          placeholder={t("editor.replace_placeholder")}
          value={replace()}
          onInput={(e) => setReplace(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } }}
        />
        <Button variant="ghost" size="sm" onClick={replaceOne} disabled={!ranges().length}>{t("editor.replace_one")}</Button>
        <Button variant="ghost" size="sm" onClick={replaceAll} disabled={!ranges().length}>{t("editor.replace_all")}</Button>
        <IconButton label={t("editor.find_close")} size="sm" onClick={close}>
          <MdOutlineClose class="w-4 h-4" />
        </IconButton>
      </div>
    </div>
  );
}
