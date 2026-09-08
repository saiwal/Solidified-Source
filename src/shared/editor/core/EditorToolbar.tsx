import { createSignal, lazy, onCleanup, Show, Suspense } from "solid-js";
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
  MdOutlineBrush, MdOutlineMap,
} from "solid-icons/md";
import EmojiPicker from "../emoji/EmojiPicker";
import { ColorPicker, OptionMenu, PromptPanel, SIZE_OPTIONS, FONT_OPTIONS } from "./ToolbarPickers";
import type { EmojiEntry } from "@utsukta/spa-core/store/emoji-store";
import { emojiEntryToImg } from "@utsukta/spa-core/lib/emojify";
import ListToolDropdown from "../components/ListToolDropdown";
import HeadingToolDropdown from "../components/HeadingToolDropdown";
import { useInstalledApps, useNavData } from "@utsukta/spa-core/store/nav-store";
import { isAppInstalled, isModuleActive } from "@utsukta/spa-core/module-registry";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";
import { fetchLinkMeta, linkMetaToBbcode, linkMetaToHtml } from "../lib/linkMeta";
import { readAlt } from "../attachments/insertHelpers";

const LatexComposerModal = lazy(() => import("../latex/LatexComposerModal"));
const CardPickerModal = lazy(() => import("../cards/CardPickerModal"));
const ExcalidrawComposerModal = lazy(() => import("../excalidraw/ExcalidrawComposerModal"));
const MapPickerModal = lazy(() => import("../map/MapPickerModal"));

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
  const [mapOpen, setMapOpen] = createSignal(false);
  const installedApps = useInstalledApps();
  const navData = useNavData();
  const showCardPicker = () => props.cardPicker && isAppInstalled(installedApps(), "/cards/");
  const showExcalidraw = () => isModuleActive("excalidraw", installedApps(), disabledFrontendModules());
  // navData().osm is null unless the core openstreetmap addon is enabled
  // site-wide; without it the tile server isn't in the page's frame-src.
  const showMap = () =>
    !!navData()?.osm && isModuleActive("openstreetmap", installedApps(), disabledFrontendModules());

  const isSource  = () => props.tab === "source";
  const isComment = () => props.level === "comment";
  const isFull    = () => props.level === "full";

  // ── WYSIWYG helpers ──────────────────────────────────────────────────────

  // Opening a toolbar dropdown/modal (the emoji picker's autofocused search
  // box, a lazy modal) blurs the contenteditable and drops its selection, so
  // a later el.focus() drops the caret at the start and everything inserts
  // there. Remember the last in-editor range and put it back before exec'ing.
  let lastRange: Range | null = null;
  const inEditor = (r: Range) => props.editorRef()?.contains(r.commonAncestorContainer) ?? false;
  // Which inline marks the caret currently sits in, so the toolbar can show
  // what you are typing in — the two dropdowns already do this (see
  // ListToolDropdown/HeadingToolDropdown); the inline buttons showed nothing.
  const [marks, setMarks] = createSignal<Record<string, boolean>>({});
  const trackSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (!inEditor(r)) return;
    lastRange = r.cloneRange();
    setMarks({
      bold:          document.queryCommandState("bold"),
      italic:        document.queryCommandState("italic"),
      underline:     document.queryCommandState("underline"),
      strikeThrough: document.queryCommandState("strikeThrough"),
    });
  };
  document.addEventListener("selectionchange", trackSelection);
  onCleanup(() => document.removeEventListener("selectionchange", trackSelection));

  const focusEditor = () => {
    const el = props.editorRef();
    if (!el) return undefined;
    el.focus();
    const sel = window.getSelection();
    const cur = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (lastRange && (!cur || !inEditor(cur))) {
      sel?.removeAllRanges();
      sel?.addRange(lastRange);
    }
    return el;
  };

  /**
   * Whether the *editor's* selection covers any text.
   *
   * window.getSelection() reports the focused element, so while a PromptPanel
   * input has focus it describes that input, not the surface. lastRange is the
   * last range that was actually in the editor, so it answers for the caret
   * the user left behind — which is the one every insert acts on.
   */
  const editorHasSelection = () => {
    const sel = window.getSelection();
    const cur = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    return cur && inEditor(cur) ? !cur.collapsed : !!lastRange && !lastRange.collapsed;
  };

  const exec = (cmd: string, value?: string) => {
    if (!focusEditor()) return;
    document.execCommand(cmd, false, value);
  };

  const ZWSP = "\u200B";

  /**
   * Insert a block-level element with a trailing caret anchor.
   *
   * insertHTML leaves the caret at the end of what it inserted, and with
   * nothing after the block that position is still *inside* it — so every
   * following keystroke stayed in the table/quote/code block with no way out.
   * The zero-width space is a text node outside the element for the caret to
   * land in. htmlToSource strips ZWSP from text nodes (htmlToSource.ts), so it
   * never reaches the saved body — the same trick sourceToHtml uses to make
   * its non-editable embeds escapable.
   */
  const insertBlock = (html: string) => {
    if (!focusEditor()) return;
    document.execCommand("insertHTML", false, html + ZWSP);
  };

  const wrapHtml = (open: string, close: string) => {
    if (!focusEditor()) return;
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
  const highlight = (c: string) => {
    if (isSource()) { wrapSource(`[mark=${c}]`, "[/mark]"); return; }
    exec("hiliteColor", c);
  };

  // hiliteColor doesn't toggle off like bold/italic/underline do natively
  // (it just re-applies the background color); unwrap manually when the
  // selection is already inside a highlighted span — same gap strike()
  // works around below. Reached from the colour panel's "None" row.
  const clearHighlight = () => {
    if (isSource()) { wrapSource("[mark]", "[/mark]"); return; }
    const el = focusEditor();
    if (!el) return;
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
    }
  };

  const strike = () => {
    if (isSource()) { wrapSource("[s]", "[/s]"); return; }
    // execCommand("strikeThrough") doesn't reliably toggle off when inside <s>; unwrap manually
    const el = focusEditor();
    if (!el) return;
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

  const color = (c: string) =>
    isSource() ? wrapSource(`[color=${c}]`, "[/color]") : exec("foreColor", c);

  const font = (f: string) =>
    isSource() ? wrapSource(`[font=${f}]`, "[/font]") : exec("fontName", f);

  const size = (v: string) => {
    if (isSource()) {
      wrapSource(`[size=${v}]`, "[/size]");
      return;
    }
    // execCommand only speaks the legacy 1-7 scale; htmlToSource maps the
    // resulting <font size> back through the same keyword table (its sizeMap),
    // so the round trip lands on the keyword the user picked.
    const map: Record<string, string> = {
      "xx-small": "1", "x-small": "2", "small": "2",
      "medium": "3", "large": "4", "x-large": "5", "xx-large": "6",
    };
    exec("fontSize", map[v] ?? "4");
  };

  // An author gives [quote=Author]; an empty field gives a plain quote.
  const quote = (author: string) => {
    if (isSource()) {
      wrapSource(author ? `[quote=${author}]` : "[quote]", "[/quote]");
      return;
    }
    // formatBlock converts the current line so the user can type straight into
    // an empty quote — but it can't carry an author, so a named quote always
    // wraps instead, leaving an anchor past the block either way.
    if (!author && !editorHasSelection()) { exec("formatBlock", "blockquote"); return; }
    const open = author ? `<span class="bb-quote">${author} wrote:</span><blockquote>` : "<blockquote>";
    wrapHtml(open, `</blockquote>${ZWSP}`);
  };

  const code = () => {
    if (isSource()) { wrapSource("[code]", "[/code]"); return; }
    // formatBlock always converts the whole current block, not just the
    // selection — fine for starting a fresh code block, but wraps the
    // entire line when the user only meant to mark a few selected words.
    // Wrap just the selection inline in that case instead.
    const sel = window.getSelection();
    const selText = sel && sel.rangeCount > 0 && !sel.isCollapsed ? sel.toString() : "";

    // A selection crossing a line boundary is a code *block*. It can't go
    // through formatBlock: that converts each selected block separately, so
    // three selected lines become three <pre> elements and save as
    // [code]a[/code][code]b[/code][code]c[/code]. Build the one block from the
    // selected text instead. <pre><code> is exactly what bbcodeToHtml emits
    // for a [code] containing newlines, so a round trip lands on identical
    // markup, and htmlToSource reads it back off textContent (:92) — the
    // inner <code> is never visited, so there is no double wrap.
    if (selText.includes("\n")) {
      // textContent in, outerHTML out: the DOM escapes &, < and > for us.
      const pre = document.createElement("pre");
      const inner = document.createElement("code");
      inner.textContent = selText;
      pre.appendChild(inner);
      insertBlock(pre.outerHTML);
      return;
    }

    if (selText) {
      // Same trailing anchor as insertBlock, for an inline <code>.
      wrapHtml("<code>", `</code>${ZWSP}`);
    } else {
      exec("formatBlock", "pre");
    }
  };

  // insertBlock rather than execCommand("insertHorizontalRule"): that command
  // leaves no node after the rule, so a rule at the end of the surface was a
  // dead end.
  const hr = () => isSource() ? insertSource("[hr]\n") : insertBlock("<hr>");

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
  const link = async (url: string) => {
    if (!url) return;
    if (isSource()) {
      const ta = props.textareaRef();
      if (ta && ta.selectionEnd > ta.selectionStart) {
        wrapSource(`[url=${url}]`, "[/url]");
        return;
      }
      setLinkLoading(true);
      const meta = await fetchLinkMeta(url);
      setLinkLoading(false);
      insertSource(linkMetaToBbcode(url, meta));
      return;
    }
    if (editorHasSelection()) { exec("createLink", url); return; }
    setLinkLoading(true);
    const meta = await fetchLinkMeta(url);
    setLinkLoading(false);
    // exec() puts lastRange back, so the caret returns to where the user left
    // it even though focus moved to the panel and then away during the fetch.
    exec("insertHTML", linkMetaToHtml(url, meta));
  };

  // One button for image/video/audio: the URL's extension already says which
  // it is, so asking the user to pick first is a click they can't get wrong
  // but still have to make. Unknown extension falls back to an image (what
  // the plain [img] button always did).
  const media = (u: string) => {
    if (!u) return;
    const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(u)?.[1]?.toLowerCase() ?? "";
    if (/^(mp4|webm|ogv|mov|m4v)$/.test(ext)) {
      isSource()
        ? insertSource(`[video]${u}[/video]`)
        : insertBlock(`<video src="${u}" controls preload="none" style="max-width:100%"></video>`);
      return;
    }
    if (/^(mp3|ogg|oga|wav|m4a|flac|opus|aac)$/.test(ext)) {
      isSource()
        ? insertSource(`[audio]${u}[/audio]`)
        : insertBlock(`<audio src="${u}" controls preload="none"></audio>`);
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
    isBlock ? insertBlock(`<div style="text-align:center">${html}</div>`) : exec("insertHTML", html);
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

  // Literal [map=lat lon] bbcode — the WYSIWYG has no live map preview, same
  // as latexMode "live" leaves plain $…$ text for the renderer to pick up.
  const insertMap = (bbcode: string) => {
    isSource() ? insertSource(bbcode) : exec("insertText", bbcode);
  };

  const insertEmoji = (entry: EmojiEntry) => {
    isSource() ? insertSource(entry.shortname + " ") : exec("insertHTML", `${emojiEntryToImg(entry)} `);
  };

  // Clamped: the fields are free number inputs, and one stray extra digit
  // would otherwise build a few thousand cells.
  const table = (colsRaw: string, rowsRaw: string) => {
    const cols = Math.min(20, Math.max(1, parseInt(colsRaw, 10) || 2));
    const rows = Math.min(50, Math.max(0, parseInt(rowsRaw, 10) || 2));
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
      insertBlock(`<table border="1">${header}${dataRows}</table>`);
    }
  };

  const spoiler = (label: string) => {
    const open  = label ? `[spoiler=${label}]` : "[spoiler]";
    if (isSource()) {
      wrapSource(open, "[/spoiler]");
    } else {
      wrapHtml(`<details><summary>${label || "Spoiler"}</summary><div>`, `</div></details>${ZWSP}`);
    }
  };

  return (
    <>
    <div class="flex flex-wrap items-center gap-0.5 px-2 py-2 shrink-0 border-t border-rim rounded-b-lg bg-surface">

      {/* ── Group 1: Inline formatting — all levels ── */}
      {/* marks() only tracks the WYSIWYG caret, so the source tab shows none. */}
      <Btn title={t("editor.bold")} onPress={bold} active={!isSource() && marks().bold}>
        <MdOutlineFormat_bold class="w-4 h-4" />
      </Btn>
      <Btn title={t("editor.italic")} onPress={italic} active={!isSource() && marks().italic}>
        <MdOutlineFormat_italic class="w-4 h-4" />
      </Btn>
      <Btn title={t("editor.underline")} onPress={underline} active={!isSource() && marks().underline}>
        <MdOutlineFormat_underlined class="w-4 h-4" />
      </Btn>
      <Btn title={t("editor.strikethrough")} onPress={strike} active={!isSource() && marks().strikeThrough}>
        <MdOutlineFormat_strikethrough class="w-4 h-4" />
      </Btn>
      <ColorPicker
        title={t("editor.highlight")}
        icon={<MdOutlineHighlight class="w-4 h-4" />}
        onPick={highlight}
        clearLabel={t("editor.highlight_none")}
        onClear={clearHighlight}
      />

      {/* ── Groups 2–7: hidden for comment level ── */}
      <Show when={!isComment()}>
        <>
          {/* ── Group 2: Text appearance ── */}
          <Sep />
          <ColorPicker
            title={t("editor.text_color")}
            icon={<MdOutlineFormat_color_text class="w-4 h-4" />}
            onPick={color}
          />
          <OptionMenu
            title={t("editor.font_family")}
            icon={<MdOutlineFont_download class="w-4 h-4" />}
            options={FONT_OPTIONS}
            onPick={font}
          />
          <OptionMenu
            title={t("editor.font_size")}
            icon={<MdOutlineFormat_size class="w-4 h-4" />}
            options={SIZE_OPTIONS}
            onPick={size}
          />

          {/* ── Group 3: Block elements ── */}
          <Sep />
          {/* Heading selector — full only. Works in source mode too: [h1]–[h6]
              are real bbcode (htmlToSource emits them, core renders them). */}
          <Show when={isFull()}>
            <HeadingToolDropdown
              onSelect={(val) => {
                if (isSource()) {
                  if (val !== "p") wrapSource(`[${val}]`, `[/${val}]`);
                  return;
                }
                if (!focusEditor()) return;
                // Picking the level the caret is already in removes it —
                // queryCommandValue reports the current block tag ("h2", "p").
                const cur = (document.queryCommandValue("formatBlock") || "").toLowerCase();
                document.execCommand("formatBlock", false, cur === val ? "p" : val);
              }}
            />
          </Show>
          <PromptPanel
            title={t("editor.blockquote")}
            icon={<MdOutlineFormat_quote class="w-4 h-4" />}
            fields={[{ key: "author", label: t("editor.quote_author") }]}
            submitLabel={t("editor.insert")}
            onSubmit={(v) => quote(v.author)}
          />
          <Show when={isFull()}>
            <>
              <Btn title={t("editor.code_block")} onPress={code}>
                <MdOutlineCode class="w-4 h-4" />
              </Btn>
            </>
          </Show>
          <Btn title={t("editor.horizontal_rule")} onPress={hr}>
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
          <PromptPanel
            title={t("editor.link")}
            icon={<MdOutlineLink class="w-4 h-4" classList={{ "animate-pulse": linkLoading() }} />}
            fields={[{ key: "url", label: t("editor.url_label") }]}
            submitLabel={t("editor.insert")}
            disabled={linkLoading()}
            onSubmit={(v) => { void link(v.url); }}
          />
          <PromptPanel
            title={t("editor.media")}
            icon={<MdOutlineImage class="w-4 h-4" />}
            fields={[{ key: "url", label: t("editor.media_url") }]}
            submitLabel={t("editor.insert")}
            onSubmit={(v) => media(v.url)}
          />
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
          <Show when={showMap()}>
            <Btn title={t("editor.map_toolbar_title")} onPress={() => setMapOpen(true)}>
              <MdOutlineMap class="w-4 h-4" />
            </Btn>
          </Show>
          <EmojiPicker onSelect={insertEmoji} />

          {/* ── Group 6: Rich structure — full only ── */}
          <Show when={isFull()}>
            <>
              <Sep />
              <PromptPanel
                title={t("editor.table")}
                icon={<MdOutlineTable_chart class="w-4 h-4" />}
                fields={[
                  { key: "cols", label: t("editor.table_columns"), value: "2", type: "number" },
                  { key: "rows", label: t("editor.table_rows"),    value: "2", type: "number" },
                ]}
                submitLabel={t("editor.insert")}
                onSubmit={(v) => table(v.cols, v.rows)}
              />
              <PromptPanel
                title={t("editor.spoiler")}
                icon={<MdOutlineVisibility_off class="w-4 h-4" />}
                fields={[{ key: "label", label: t("editor.spoiler_label") }]}
                submitLabel={t("editor.insert")}
                onSubmit={(v) => spoiler(v.label)}
              />
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
      <Suspense>
        <LatexComposerModal
          mode={props.latexMode}
          onClose={() => setLatexOpen(false)}
          onInsert={insertLatex}
        />
      </Suspense>
    </Show>

    <Show when={cardPickerOpen()}>
      <Suspense>
        <CardPickerModal
          onClose={() => setCardPickerOpen(false)}
          onInsert={insertCard}
        />
      </Suspense>
    </Show>

    <Show when={mapOpen()}>
      <Suspense>
        <MapPickerModal onClose={() => setMapOpen(false)} onInsert={insertMap} />
      </Suspense>
    </Show>

    <Show when={excalidrawOpen()}>
      {/* The Excalidraw chunk is heavy (React + the package); show the backdrop
          with a spinner while it downloads instead of nothing. */}
      <Suspense
        fallback={
          <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/60">
            <span class="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <ExcalidrawComposerModal
          onClose={() => setExcalidrawOpen(false)}
          onInsert={insertExcalidraw}
        />
      </Suspense>
    </Show>
    </>
  );
}

function Sep() {
  return <span class="w-px h-4 bg-rim mx-0.5 self-center" />;
}

function Btn(props: {
  title: string;
  onPress: (e: MouseEvent) => void;
  children: any;
  disabled?: boolean;
  /** Caret is inside this mark — same lit style the dropdowns use when open. */
  active?: boolean;
}) {
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
          : `hover:bg-elevated ${props.active ? "bg-elevated text-accent" : "text-txt"}`)
      }
    >
      {props.children}
    </button>
  );
}
