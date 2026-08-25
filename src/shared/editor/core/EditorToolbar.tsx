import { createSignal, lazy, Show } from "solid-js";
import type { LatexInsertMode, ToolbarLevel } from "../types/editor.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  MdOutlineLink, MdOutlineImage,
  MdOutlineFormat_bold, MdOutlineFormat_italic, MdOutlineFormat_underlined,
  MdOutlineFormat_strikethrough, MdOutlineHighlight,
  MdOutlineFormat_color_text, MdOutlineFont_download, MdOutlineFormat_size,
  MdOutlineFormat_quote, MdOutlineCode, MdOutlineHorizontal_rule,
  MdOutlineFunctions, MdOutlineStyle,
  MdOutlineTable_chart, MdOutlineVisibility_off, MdOutlineFormat_clear,
  MdOutlineBrush,
} from "solid-icons/md";
import EmojiPicker from "../emoji/EmojiPicker";
import type { EmojiEntry } from "@utsukta/spa-core/store/emoji-store";
import { emojiEntryToImg } from "@utsukta/spa-core/lib/emojify";
import ListToolDropdown from "../components/ListToolDropdown";
import HeadingToolDropdown from "../components/HeadingToolDropdown";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isAppInstalled, isModuleActive } from "@utsukta/spa-core/module-registry";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";
import { fetchLinkMeta, linkMetaToBbcode, linkMetaToHtml } from "../lib/linkMeta";
import { readAlt } from "../attachments/insertHelpers";

const LatexComposerModal = lazy(() => import("../latex/LatexComposerModal"));
const CardPickerModal = lazy(() => import("../cards/CardPickerModal"));
const ExcalidrawComposerModal = lazy(() => import("../excalidraw/ExcalidrawComposerModal"));

interface Props {
  level: ToolbarLevel;
  latexMode: LatexInsertMode;
  /** Show the "Insert card" button — see EditorCapabilities.cardPicker. */
  cardPicker?: boolean;
  tab: "wysiwyg" | "source";
  editorRef: () => HTMLDivElement | undefined;
  textareaRef: () => HTMLTextAreaElement | undefined;
  onSourceChange: (v: string) => void;
}

export default function EditorToolbar(props: Props) {
  const { t } = useI18n();
  const [latexOpen, setLatexOpen] = createSignal(false);
  // True while the insert-URL button is scraping the pasted URL.
  const [linkLoading, setLinkLoading] = createSignal(false);
  const [cardPickerOpen, setCardPickerOpen] = createSignal(false);
  const [excalidrawOpen, setExcalidrawOpen] = createSignal(false);
  const installedApps = useInstalledApps();
  const showCardPicker = () => props.cardPicker && isAppInstalled(installedApps(), "/cards/");
  const showExcalidraw = () => isModuleActive("excalidraw", installedApps(), disabledFrontendModules());

  const isSource  = () => props.tab === "source";
  const isComment = () => props.level === "comment";
  const isFull    = () => props.level === "full";

  // ── WYSIWYG helpers ──────────────────────────────────────────────────────

  const exec = (cmd: string, value?: string) => {
    const el = props.editorRef();
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false, value);
  };

  const wrapHtml = (open: string, close: string) => {
    const el = props.editorRef();
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      document.execCommand("insertHTML", false, `${open}${close}`);
      return;
    }
    const frag = sel.getRangeAt(0).cloneContents();
    const tmp  = document.createElement("div");
    tmp.appendChild(frag);
    document.execCommand("insertHTML", false, `${open}${tmp.innerHTML}${close}`);
  };

  // ── Source helpers ───────────────────────────────────────────────────────

  const wrapSource = (open: string, close: string) => {
    const ta = props.textareaRef();
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    props.onSourceChange(value.slice(0, s) + open + sel + close + value.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + open.length, s + open.length + sel.length);
    });
  };

  const insertSource = (text: string) => {
    const ta = props.textareaRef();
    if (!ta) return;
    const { selectionStart: s, value } = ta;
    props.onSourceChange(value.slice(0, s) + text + value.slice(s));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + text.length, s + text.length);
    });
  };

  // ── Button actions (branch on tab for mode-aware behavior) ───────────────

  const bold      = () => isSource() ? wrapSource("[b]", "[/b]")   : exec("bold");
  const italic    = () => isSource() ? wrapSource("[i]", "[/i]")   : exec("italic");
  const underline = () => isSource() ? wrapSource("[u]", "[/u]")   : exec("underline");
  const highlight = () => {
    if (isSource()) { wrapSource("[mark]", "[/mark]"); return; }
    // hiliteColor doesn't toggle off like bold/italic/underline do natively
    // (it just re-applies the background color); unwrap manually when the
    // selection is already inside a highlighted span — same gap strike()
    // works around below.
    const el = props.editorRef();
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node    = sel.getRangeAt(0).commonAncestorContainer;
    const parentEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
    const hlEl    = parentEl?.closest?.("mark, span[style*='background-color']");
    if (hlEl && el.contains(hlEl)) {
      const r = document.createRange();
      r.selectNode(hlEl);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand("insertHTML", false, (hlEl as HTMLElement).innerHTML);
    } else {
      exec("hiliteColor", "yellow");
    }
  };

  const strike = () => {
    if (isSource()) { wrapSource("[s]", "[/s]"); return; }
    // execCommand("strikeThrough") doesn't reliably toggle off when inside <s>; unwrap manually
    const el = props.editorRef();
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node    = sel.getRangeAt(0).commonAncestorContainer;
    const parentEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
    const sEl     = parentEl?.closest?.("s, strike");
    if (sEl && el.contains(sEl)) {
      const r = document.createRange();
      r.selectNode(sEl);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand("insertHTML", false, (sEl as HTMLElement).innerHTML);
    } else {
      exec("strikeThrough");
    }
  };

  const color = () => {
    const c = prompt("Color (name or #hex):", "red");
    if (!c) return;
    isSource() ? wrapSource(`[color=${c}]`, "[/color]") : exec("foreColor", c);
  };

  const font = () => {
    const f = prompt("Font name:", "courier");
    if (!f) return;
    isSource() ? wrapSource(`[font=${f}]`, "[/font]") : exec("fontName", f);
  };

  const size = () => {
    const s = prompt("Size (small, medium, large, xx-large):", "large");
    if (!s) return;
    if (isSource()) {
      wrapSource(`[size=${s}]`, "[/size]");
    } else {
      const map: Record<string, string> = {
        "xx-small": "1", "x-small": "1", "small": "2",
        "medium": "3", "large": "4", "x-large": "5", "xx-large": "6",
      };
      exec("fontSize", map[s] ?? "4");
    }
  };

  // One button, one prompt: an author gives [quote=Author], empty (just OK)
  // gives a plain quote. Cancel aborts.
  const quote = () => {
    const a = prompt("Author name (leave empty for a plain quote):");
    if (a === null) return;
    if (!a.trim()) {
      isSource() ? wrapSource("[quote]", "[/quote]") : exec("formatBlock", "blockquote");
      return;
    }
    if (isSource()) {
      wrapSource(`[quote=${a.trim()}]`, "[/quote]");
    } else {
      wrapHtml(`<span class="bb-quote">${a.trim()} wrote:</span><blockquote>`, "</blockquote>");
    }
  };

  const code = () => {
    if (isSource()) { wrapSource("[code]", "[/code]"); return; }
    // formatBlock always converts the whole current block, not just the
    // selection — fine for starting a fresh code block, but wraps the
    // entire line when the user only meant to mark a few selected words.
    // Wrap just the selection inline in that case instead.
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      wrapHtml("<code>", "</code>");
    } else {
      exec("formatBlock", "pre");
    }
  };

  const hr = () => isSource() ? insertSource("[hr]\n") : exec("insertHorizontalRule");

  // Lettered list (a. b. c.) — insertOrderedList gives a plain decimal <ol>,
  // so re-tag it with the same class/style bbcode.ts's sourceToHtml stamps
  // for [list=a] (see htmlToSource's "ol" case, which reads list-style-type
  // back to pick the bbcode marker). Re-inserted via execCommand("insertHTML")
  // rather than mutating the <ol> directly — a direct DOM mutation wouldn't
  // fire the "input" event RichEditor relies on to pick up the change
  // (same reason highlight()/strike() above unwrap-and-reinsert instead of
  // just editing the matched element in place).
  const listAlpha = () => {
    exec("insertOrderedList");
    const el = props.editorRef();
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const parentEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
    const ol = parentEl?.closest?.("ol");
    if (!ol || !el.contains(ol)) return;
    const r = document.createRange();
    r.selectNode(ol);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand(
      "insertHTML", false,
      `<ol class="listloweralpha" style="list-style-type: lower-alpha;">${ol.innerHTML}</ol>`,
    );
  };

  // Linking selected text is "make this a link" and stays literal. With no
  // selection the user is dropping in a bare URL, so we scrape it (see
  // ../lib/linkMeta) and insert a title/thumbnail/quote preview instead.
  // A failed scrape degrades to the plain link the button always produced.
  const link = async () => {
    if (isSource()) {
      const ta = props.textareaRef();
      const hasSel = !!ta && ta.selectionEnd > ta.selectionStart;
      const u = prompt("URL:");
      if (!u) return;
      if (hasSel) {
        wrapSource(`[url=${u}]`, "[/url]");
        return;
      }
      setLinkLoading(true);
      const meta = await fetchLinkMeta(u);
      setLinkLoading(false);
      insertSource(linkMetaToBbcode(u, meta));
      return;
    }
    // Save selection before prompt() steals focus and clears contenteditable selection
    const el  = props.editorRef();
    if (!el) return;
    const sel = window.getSelection();
    let savedRange: Range | null = null;
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
    const hasText = savedRange && !savedRange.collapsed;
    const url = prompt("URL:");
    if (!url) return;
    if (hasText) {
      el.focus();
      sel!.removeAllRanges();
      sel!.addRange(savedRange!);
      document.execCommand("createLink", false, url);
      return;
    }
    setLinkLoading(true);
    const meta = await fetchLinkMeta(url);
    setLinkLoading(false);
    // Restore the caret *after* the await too — focus moved during the fetch.
    el.focus();
    if (savedRange) { sel!.removeAllRanges(); sel!.addRange(savedRange); }
    document.execCommand("insertHTML", false, linkMetaToHtml(url, meta));
  };

  // One button for image/video/audio: the URL's extension already says which
  // it is, so asking the user to pick first is a click they can't get wrong
  // but still have to make. Unknown extension falls back to an image (what
  // the plain [img] button always did).
  const media = () => {
    const u = prompt("Media URL:");
    if (!u) return;
    const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(u)?.[1]?.toLowerCase() ?? "";
    if (/^(mp4|webm|ogv|mov|m4v)$/.test(ext)) {
      isSource()
        ? insertSource(`[video]${u}[/video]`)
        : exec("insertHTML", `<video src="${u}" controls preload="none" style="max-width:100%"></video>`);
      return;
    }
    if (/^(mp3|ogg|oga|wav|m4a|flac|opus|aac)$/.test(ext)) {
      isSource()
        ? insertSource(`[audio]${u}[/audio]`)
        : exec("insertHTML", `<audio src="${u}" controls preload="none"></audio>`);
      return;
    }
    isSource() ? insertSource(`[img]${u}[/img]`) : exec("insertImage", u);
  };

  // The text/bbcode is built by LatexComposerModal (it knows inline vs.
  // block, and image vs. live mode); here we just splice it in, mirroring
  // how media() inserts raw bbcode for source and a real DOM
  // node for wysiwyg.
  // The compact [card=<id>][/card] token is plain text in both tabs: in
  // wysiwyg the blur pass (RichEditor.onEditorBlur) swaps it for the rendered
  // chip, so inserting markup here would only fight that.
  const insertCard = (iid: number) => {
    const token = `[card=${iid}][/card]`;
    if (isSource()) {
      insertSource(token);
      return;
    }
    exec("insertText", token);
  };

  const insertLatex = (text: string) => {
    if (isSource()) {
      insertSource(text);
      return;
    }
    if (props.latexMode === "live") {
      // Plain $…$ / $$…$$ text — rendered later by hydrateLatex() wherever
      // this content is displayed, so wysiwyg just gets the literal text.
      exec("insertText", text.trim());
      return;
    }
    const trimmed = text.trim();
    const isBlock = trimmed.startsWith("[center]");
    const inner = isBlock ? trimmed.slice("[center]".length, -"[/center]".length) : trimmed;
    const m = /^\[img width='(\d+)' class='bb-latex-img' ([^\]]*)\](.+)\[\/img\]$/s.exec(inner);
    if (!m) return;
    const [, width, altAttr, src] = m;
    const alt = readAlt(altAttr);
    // Constrain to the un-scaled width so the retina (3x) raster displays at
    // its intended inline size — same convention as applyImgWidth() below.
    // class="bb-latex-img" (see index.css) overrides Tailwind preflight's
    // `img { display: block }` so it flows inline like the saved post will.
    const html = `<img src="${src}" alt="${alt}" class="bb-latex-img" style="width:${width}px" />`;
    exec("insertHTML", isBlock ? `<div style="text-align:center">${html}</div>` : html);
  };

  // Either a flat [img] tag (drawing inserted as an image) or an
  // [attachment] tag (the .excalidraw scene inserted as a file). Only the
  // former has a live preview; the attachment goes in as literal bbcode.
  const insertExcalidraw = (bbcode: string) => {
    if (isSource()) {
      insertSource(bbcode);
      return;
    }
    const m = /^\[img ([^\]]*)\](.+)\[\/img\]$/.exec(bbcode);
    if (!m) {
      exec("insertText", bbcode);
      return;
    }
    const [, altAttr, src] = m;
    const alt = readAlt(altAttr);
    exec("insertHTML", `<img src="${src}" alt="${alt}" />`);
  };

  const insertEmoji = (entry: EmojiEntry) => {
    isSource() ? insertSource(entry.shortname + " ") : exec("insertHTML", `${emojiEntryToImg(entry)} `);
  };

  const table = () => {
    const colsRaw = prompt("Number of columns:", "2");
    if (!colsRaw) return;
    const rowsRaw = prompt("Number of rows (excluding header):", "2");
    if (!rowsRaw) return;
    const cols = Math.max(1, parseInt(colsRaw, 10) || 2);
    const rows = Math.max(0, parseInt(rowsRaw, 10) || 2);
    if (isSource()) {
      const header   = "[tr]" + Array.from({ length: cols }, (_, i) => `[th]Header ${i + 1}[/th]`).join("") + "[/tr]";
      const dataRows = Array.from({ length: rows }, (_, r) =>
        "[tr]" + Array.from({ length: cols }, (_, c) => `[td]Cell ${r + 1}-${c + 1}[/td]`).join("") + "[/tr]"
      ).join("\n");
      insertSource(`[table border=1]\n${header}\n${dataRows}\n[/table]\n`);
    } else {
      const header   = "<tr>" + Array.from({ length: cols }, (_, i) => `<th>Header ${i + 1}</th>`).join("") + "</tr>";
      const dataRows = Array.from({ length: rows }, (_, r) =>
        "<tr>" + Array.from({ length: cols }, (_, c) => `<td>Cell ${r + 1}-${c + 1}</td>`).join("") + "</tr>"
      ).join("");
      exec("insertHTML", `<table border="1">${header}${dataRows}</table>`);
    }
  };

  const spoiler = () => {
    const label = prompt("Spoiler label (optional):", "") ?? "";
    const open  = label ? `[spoiler=${label}]` : "[spoiler]";
    if (isSource()) {
      wrapSource(open, "[/spoiler]");
    } else {
      wrapHtml(`<details><summary>${label || "Spoiler"}</summary><div>`, "</div></details>");
    }
  };

  return (
    <>
    <div class="flex flex-wrap items-center gap-0.5 px-2 py-2 shrink-0 border-t border-rim rounded-b-lg bg-surface">

      {/* ── Group 1: Inline formatting — all levels ── */}
      <Btn title={t("editor.bold")} onPress={bold}>
        <MdOutlineFormat_bold class="w-4 h-4" />
      </Btn>
      <Btn title={t("editor.italic")} onPress={italic}>
        <MdOutlineFormat_italic class="w-4 h-4" />
      </Btn>
      <Btn title={t("editor.underline")} onPress={underline}>
        <MdOutlineFormat_underlined class="w-4 h-4" />
      </Btn>
      <Btn title={t("editor.strikethrough")} onPress={strike}>
        <MdOutlineFormat_strikethrough class="w-4 h-4" />
      </Btn>
      <Btn title={t("editor.highlight")} onPress={highlight}>
        <MdOutlineHighlight class="w-4 h-4" />
      </Btn>

      {/* ── Groups 2–7: hidden for comment level ── */}
      <Show when={!isComment()}>
        <>
          {/* ── Group 2: Text appearance ── */}
          <Sep />
          <Btn title="Text color [color=X]" onPress={color}>
            <MdOutlineFormat_color_text class="w-4 h-4" />
          </Btn>
          <Btn title="Font family [font=X]" onPress={font}>
            <MdOutlineFont_download class="w-4 h-4" />
          </Btn>
          <Btn title="Font size [size=X]" onPress={size}>
            <MdOutlineFormat_size class="w-4 h-4" />
          </Btn>

          {/* ── Group 3: Block elements ── */}
          <Sep />
          {/* Heading selector — full only; disabled (not hidden) in source
              mode since bbcode has no heading tag, so the toolbar's button
              set stays constant across the write/source toggle. */}
          <Show when={isFull()}>
            <HeadingToolDropdown
              disabled={isSource()}
              onSelect={(val) => {
                const el = props.editorRef();
                if (!el) return;
                el.focus();
                // Picking the level the caret is already in removes it —
                // queryCommandValue reports the current block tag ("h2", "p").
                const cur = (document.queryCommandValue("formatBlock") || "").toLowerCase();
                document.execCommand("formatBlock", false, cur === val ? "p" : val);
              }}
            />
          </Show>
          <Btn title={t("editor.blockquote")} onPress={quote}>
            <MdOutlineFormat_quote class="w-4 h-4" />
          </Btn>
          <Show when={isFull()}>
            <>
              <Btn title={t("editor.code_block")} onPress={code}>
                <MdOutlineCode class="w-4 h-4" />
              </Btn>
            </>
          </Show>
          <Btn title="Horizontal rule [hr]" onPress={hr}>
            <MdOutlineHorizontal_rule class="w-4 h-4" />
          </Btn>

          {/* ── Group 4: Lists — grouped in one dropdown; disabled (not
              hidden) in source mode to keep the toolbar layout constant. ── */}
          <Sep />
          <ListToolDropdown
            disabled={isSource()}
            onSelect={(kind) => {
              if (kind === "bullet") exec("insertUnorderedList");
              else if (kind === "number") exec("insertOrderedList");
              else listAlpha();
            }}
          />

          {/* ── Group 5: Insert ── */}
          <Sep />
          <Btn title={t("editor.link")} onPress={link} disabled={linkLoading()}>
            <MdOutlineLink class="w-4 h-4" classList={{ "animate-pulse": linkLoading() }} />
          </Btn>
          <Btn title="Media [img] [video] [audio]" onPress={media}>
            <MdOutlineImage class="w-4 h-4" />
          </Btn>
          <Btn title={t("editor.latex_toolbar_title")} onPress={() => setLatexOpen(true)}>
            <MdOutlineFunctions class="w-4 h-4" />
          </Btn>
          <Show when={showCardPicker()}>
            <Btn title={t("editor.card_toolbar_title")} onPress={() => setCardPickerOpen(true)}>
              <MdOutlineStyle class="w-4 h-4" />
            </Btn>
          </Show>
          <Show when={showExcalidraw()}>
            <Btn title={t("editor.excalidraw_toolbar_title")} onPress={() => setExcalidrawOpen(true)}>
              <MdOutlineBrush class="w-4 h-4" />
            </Btn>
          </Show>
          <EmojiPicker onSelect={insertEmoji} />

          {/* ── Group 6: Rich structure — full only ── */}
          <Show when={isFull()}>
            <>
              <Sep />
              <Btn title="Insert table [table]" onPress={table}>
                <MdOutlineTable_chart class="w-4 h-4" />
              </Btn>
              <Btn title="Spoiler [spoiler]" onPress={spoiler}>
                <MdOutlineVisibility_off class="w-4 h-4" />
              </Btn>
            </>
          </Show>

          {/* ── Group 7: Utility — full only, pushed right; disabled (not
              hidden) in source mode since it acts on the WYSIWYG DOM. ── */}
          <Show when={isFull()}>
            <>
              <span class="flex-1" />
              <Btn
                title={t("editor.clear_formatting")}
                onPress={() => { exec("formatBlock", "p"); exec("removeFormat"); }}
                disabled={isSource()}
              >
                <MdOutlineFormat_clear class="w-4 h-4" />
              </Btn>
            </>
          </Show>
        </>
      </Show>
    </div>
    <Show when={latexOpen()}>
      <LatexComposerModal
        mode={props.latexMode}
        onClose={() => setLatexOpen(false)}
        onInsert={insertLatex}
      />
    </Show>

    <Show when={cardPickerOpen()}>
      <CardPickerModal
        onClose={() => setCardPickerOpen(false)}
        onInsert={insertCard}
      />
    </Show>

    <Show when={excalidrawOpen()}>
      <ExcalidrawComposerModal
        onClose={() => setExcalidrawOpen(false)}
        onInsert={insertExcalidraw}
      />
    </Show>
    </>
  );
}

function Sep() {
  return <span class="w-px h-4 bg-rim mx-0.5 self-center" />;
}

function Btn(props: { title: string; onPress: (e: MouseEvent) => void; children: any; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        if (!props.disabled) props.onPress(e);
      }}
      class={
        "px-1.5 py-0.5 rounded transition-colors " +
        (props.disabled
          ? "text-muted/40 cursor-not-allowed"
          : "text-txt hover:bg-elevated")
      }
    >
      {props.children}
    </button>
  );
}
