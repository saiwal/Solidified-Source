import { createEffect, createSignal, onCleanup, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { EditorCapabilities, EditorTab, MimeType } from "../types/editor.types";
import { canUseWysiwyg } from "@utsukta/spa-core/lib/mimetypes";
import EditorToolbar from "./EditorToolbar";
import { sourceToHtml, hydrateShareEmbeds, hydrateCardEmbeds, hydrateLatexEmbeds } from "./sourceToHtml";
import { completesMarkdownBlock } from "./markdownProtect";
import { htmlToSource } from "./htmlToSource";
import { useI18n } from "@utsukta/spa-core/i18n";

interface Props {
  body: string;
  onInput: (v: string) => void;
  capabilities: EditorCapabilities;
  tab: EditorTab;
  onTabChange: (t: EditorTab) => void;
  mimetype?: MimeType;
  onCtrlEnter?: () => void;
  /** Return true to consume Enter and suppress the default newline insertion. */
  onEnter?: () => boolean;
  /**
   * Receives files pasted from the clipboard (screenshots, copied images).
   * When set, file pastes are consumed here instead of the browser default,
   * which would dump the image into the WYSIWYG as an inline base64 blob.
   */
  onPasteFiles?: (files: File[]) => void;
  /**
   * Alt text changed in the image popup, reported by image URL — lets the
   * composer sync it back onto the matching attachment chip's ALT badge.
   */
  onImageAlt?: (src: string, alt: string) => void;
  placeholder?: string;
  minHeight?: string;
  /** Caps the editing surface's growth — it scrolls internally past this. */
  maxHeight?: string;
  /** Let the user drag-resize the editing surface vertically. */
  resizable?: boolean;
  /**
   * Stretches the surface to fill its ancestor's height instead of capping
   * at maxHeight — for modals that give RichEditor a real bounded height to
   * grow into. Has no effect if no ancestor in the flex chain is bounded.
   */
  fill?: boolean;
}

export default function RichEditor(props: Props) {
  const { t } = useI18n();
  let editorRef: HTMLDivElement | undefined;
  let wrapperEl: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  // (mimetype, body) signature the DOM currently reflects — set whenever *we*
  // write to the DOM, whether from typing (DOM→body echo) or an external body
  // change. The sync effect only re-renders when props no longer match this,
  // so an external update (e.g. inserting an attachment) is never dropped.
  // A prior isUserTyping boolean tried to infer this from event timing, but a
  // stray "input" event (e.g. fired on blur when focus moved to an unrelated
  // button) could leave it stuck true and silently swallow the next sync.
  let domSig: string | null = null;

  const mime = (): MimeType => props.mimetype ?? "text/bbcode";
  // Which formats may use the WYSIWYG surface. It round-trips the whole body
  // through htmlToSource() on every keystroke, so a format is only safe here
  // if that round trip is lossless: bbcode always, and markdown on the
  // surfaces whose body is converted to bbcode on save (markdownWysiwyg —
  // posts and comments). text/html and text/plain stay source-only; plain has
  // no branch in htmlToSource at all and would come back as bbcode.
  // Derived rather than pushed back through onTabChange so the caller's tab
  // state is left untouched and the WYSIWYG tab returns as it was.
  const wysiwygAllowed = () => canUseWysiwyg(mime(), props.capabilities.markdownWysiwyg);
  const tab = (): EditorTab => (wysiwygAllowed() ? props.tab : "source");
  const sig = () => `${mime()} ${props.body}`;
  const minH = () =>
    props.minHeight ??
    (props.capabilities.toolbar === "comment" ? "130px" : "150px");
  // A ceiling so the surface scrolls internally instead of growing forever —
  // in px/vh (never %) so it self-caps even when nothing above it in the DOM
  // gives it a bounded height to grow against (e.g. plain page-flow composers).
  // In fill mode there's no ceiling here at all — the surface instead grows
  // via flex-1 to whatever bounded height its ancestor provides.
  // Clamped so the ceiling can never sit below the floor. Without the clamp a
  // caller asking for a tall surface (the page-hosted composers) got
  // max-height 50vh < its own min-height on any normal laptop, so the surface
  // could not grow to the height its wrapper had already reserved — and the
  // shortfall showed as dead space under the toolbar.
  const maxH = () => {
    if (props.fill) return undefined;
    const ceiling =
      props.maxHeight ?? (props.capabilities.toolbar === "comment" ? "260px" : "50vh");
    return `max(${ceiling}, ${minH()})`;
  };
  const surfaceGrowClass = () => (props.fill ? "flex-1 min-h-0" : "grow");

  // Seed the WYSIWYG surface whenever it (re)mounts. The <Show> around the
  // surface destroys the div on every tab switch, so this must run per mount
  // (a plain onMount fires once per component and would leave the div blank
  // after source → wysiwyg round-trips).
  const seedEditor = (el: HTMLDivElement) => {
    editorRef = el;
    el.innerHTML = sourceToHtml(props.body, mime());
    domSig = sig();
    hydrateShareEmbeds(el);
    hydrateCardEmbeds(el);
    if (props.capabilities.latexMode === "live") hydrateLatexEmbeds(el);
    setImgSel(null);
  };

  // Re-render whenever body/mimetype changed for a reason other than us
  // echoing the DOM back (attachment insert, draft load, tab switch, reset, …).
  createEffect(() => {
    const nextSig = sig();
    if (tab() === "wysiwyg" && editorRef && nextSig !== domSig) {
      editorRef.innerHTML = sourceToHtml(props.body, mime());
      domSig = nextSig;
      hydrateShareEmbeds(editorRef);
      hydrateCardEmbeds(editorRef);
      if (props.capabilities.latexMode === "live") hydrateLatexEmbeds(editorRef);
      setImgSel(null); // DOM was replaced — a selected <img> no longer exists
      // Placing a selection inside a contenteditable focuses it, so only move
      // the caret when focus isn't in another field (e.g. the alt-text box,
      // whose per-keystroke body patches land here).
      const active = document.activeElement;
      if (editorRef.contains(active) || active === document.body || active === null) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editorRef);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
        // Follow the caret: an inserted image sits below the fold, and its
        // height is only known once it loads, so scroll again on load.
        const el = editorRef;
        const follow = () => {
          el.scrollTop = el.scrollHeight;
          // block:"nearest" also nudges any outer scroller (page-flow
          // composers, where the surface itself never scrolls).
          el.lastElementChild?.scrollIntoView({ block: "nearest" });
        };
        follow();
        el.querySelectorAll("img").forEach((img) => {
          if (!img.complete) img.addEventListener("load", follow, { once: true });
        });
      }
    }
  });

  // Re-render the block the user just finished with Enter, so Markdown takes
  // effect as you write rather than only when focus leaves.
  //
  // Only the *previous* block is touched — never the one holding the caret —
  // so there is no caret to save and restore. That is the whole reason this
  // works on every keystroke's worth of state without fighting the cursor,
  // unlike the blur pass, which replaces the entire surface.
  //
  // Markdown only. Bbcode already has its own settled behaviour here, and
  // re-rendering its tags mid-compose would be a change to a stable feature.
  const renderCompletedBlock = () => {
    if (!editorRef || mime() !== "text/markdown" || !wysiwygAllowed()) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // Walk up to the direct child of the surface that holds the caret.
    let node: Node | null = sel.getRangeAt(0).startContainer;
    while (node && node.parentNode !== editorRef) node = node.parentNode;
    const caretBlock = node as Element | null;
    if (!caretBlock || caretBlock.parentNode !== editorRef) return;

    const done = caretBlock.previousElementSibling;
    if (!done) return;

    // Already rendered: an embed carries bbcode that must round-trip
    // byte-for-byte, and re-rendering a block that holds one risks nothing but
    // gains nothing either.
    if (done.querySelector("[data-bb-raw],[data-share-id],[data-card-id],[data-latex-raw]")) return;

    const line = htmlToSource(done.outerHTML, mime()).trim();

    // Everything above it, so completesMarkdownBlock() can see an unclosed
    // ``` fence — inside one, nothing is markup.
    const before = Array.from(editorRef.children)
      .slice(0, Array.prototype.indexOf.call(editorRef.children, done))
      .map((el) => el.outerHTML)
      .join("");

    if (!completesMarkdownBlock(line, htmlToSource(before, mime()))) return;

    const rendered = sourceToHtml(line, mime());
    if (!rendered.trim()) return;

    const holder = document.createElement("div");
    holder.innerHTML = rendered;
    if (!holder.firstChild) return;
    done.replaceWith(...Array.from(holder.childNodes));

    // The line may have carried bbcode, which sourceToHtml just turned into
    // fresh embeds needing their previews filled in.
    hydrateShareEmbeds(editorRef);
    hydrateCardEmbeds(editorRef);
    if (props.capabilities.latexMode === "live") hydrateLatexEmbeds(editorRef);
  };

  const onEditorInput = (e?: InputEvent) => {
    if (!editorRef) return;
    // Enter (not Shift+Enter, which is insertLineBreak) finished a block.
    if (e?.inputType === "insertParagraph") renderCompletedBlock();
    // Convert WYSIWYG HTML back to the chosen source format before storing
    const next = htmlToSource(editorRef.innerHTML, mime());
    domSig = `${mime()} ${next}`;
    props.onInput(next);
  };

  const onTextareaInput = (e: InputEvent) => {
    props.onInput((e.target as HTMLTextAreaElement).value);
  };

  // Renders bbcode typed (or pasted without triggering the paste-time
  // expansion above) directly into the editor — [share], [img], [url],
  // formatting tags, auto-linked URLs, $…$/$$…$$ math, etc. — once focus
  // leaves the editor. Not done on every keystroke — replacing DOM nodes
  // while the caret is mid-edit would fight cursor position (same reason the
  // body-sync effect above only re-renders on external changes). Toolbar
  // buttons are unaffected: they preventDefault on mousedown, so clicking
  // one never blurs the editor. Scoped to bbcode mode — markdown/html source
  // (wiki, webpage editors) already renders correctly without this pass, and
  // round-tripping through marked/Turndown here would risk lossy rewrites.
  const onEditorBlur = (e: FocusEvent) => {
    if (!editorRef) return;
    // Focus moving into the image popup must NOT re-render the surface: that
    // replaces every node, so the <img> imgSel() holds is detached and each
    // width/alt edit lands on an orphan — the popup looked dead. Its buttons
    // additionally preventDefault on mousedown (like the toolbar's) since not
    // every browser focuses a button on click, which would leave no
    // relatedTarget to test here.
    if (popupRef?.contains(e.relatedTarget as Node)) return;
    // Same for focus moving into the toolbar (the emoji picker's autofocused
    // search box is the only child that takes focus): re-rendering here
    // replaces every node, so the range the toolbar saved to insert at is
    // detached and the insert lands at the start of the surface instead.
    if (wrapperEl?.contains(e.relatedTarget as Node)) return;
    if (wysiwygAllowed()) {
      const next = htmlToSource(editorRef.innerHTML, mime());
      editorRef.innerHTML = sourceToHtml(next, mime());
      domSig = `${mime()} ${next}`;
      hydrateShareEmbeds(editorRef);
      hydrateCardEmbeds(editorRef);
    }
    if (props.capabilities.latexMode === "live") hydrateLatexEmbeds(editorRef);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && props.onEnter?.()) {
      e.preventDefault();
      return;
    }
    if (
      props.capabilities.submitOnCtrlEnter &&
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault();
      props.onCtrlEnter?.();
    }
  };

  // ── Image resize popup ─────────────────────────────────────────────────────
  // Click an image in the WYSIWYG → floating popup with preset sizes and a
  // px-width input. Only width is written (height cleared), so the aspect
  // ratio is always preserved; htmlToSource serializes it as [img width='N'].
  const [imgSel, setImgSel] = createSignal<{ el: HTMLImageElement; rect: DOMRect } | null>(null);
  const [widthVal, setWidthVal] = createSignal("");
  const [altVal, setAltVal] = createSignal("");
  let popupRef: HTMLDivElement | undefined;

  const onEditorClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLImageElement && !t.closest(".bb-share-embed, .bb-card-embed-wrap")) {
      setWidthVal(String(parseInt(t.style.width, 10) || Math.round(t.getBoundingClientRect().width)));
      setAltVal(t.alt === "Image/photo" ? "" : t.alt);
      setImgSel({ el: t, rect: t.getBoundingClientRect() });
    } else {
      setImgSel(null);
    }
  };

  const onDocClick = (e: MouseEvent) => {
    const sel = imgSel();
    if (!sel) return;
    const t = e.target as Node;
    if (t !== sel.el && !popupRef?.contains(t)) setImgSel(null);
  };
  document.addEventListener("click", onDocClick);
  onCleanup(() => document.removeEventListener("click", onDocClick));

  // width = null resets to the image's natural size
  const applyImgWidth = (w: number | null) => {
    const sel = imgSel();
    if (!sel) return;
    if (w === null) {
      sel.el.style.removeProperty("width");
    } else {
      sel.el.style.width = `${Math.max(16, Math.round(w))}px`;
    }
    sel.el.style.removeProperty("height");
    setWidthVal(String(Math.round(sel.el.getBoundingClientRect().width)));
    onEditorInput();
  };

  const applyImgAlt = (text: string) => {
    const sel = imgSel();
    if (!sel) return;
    // Alt ends up in a single-line [img alt="..."] tag, so collapse any
    // newlines from the textarea into spaces before writing it back.
    sel.el.alt = text.trim().replace(/\s+/g, " ");
    props.onImageAlt?.(sel.el.getAttribute("src") ?? "", sel.el.alt);
    onEditorInput();
  };

  const popupStyle = () => {
    const r = imgSel()!.rect;
    // Above the image unless that would leave the viewport — then below it.
    return r.top > 72
      ? { left: `${Math.max(8, r.left)}px`, top: `${r.top - 8}px`, transform: "translateY(-100%)" }
      : { left: `${Math.max(8, r.left)}px`, top: `${r.bottom + 8}px` };
  };

  const handlePaste = (e: ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt) return;
    if (props.onPasteFiles) {
      // dt.files misses some sources (e.g. certain Linux clipboard managers),
      // so fall back to scanning items for file entries.
      const files = dt.files.length
        ? Array.from(dt.files)
        : Array.from(dt.items)
            .filter((i) => i.kind === "file")
            .map((i) => i.getAsFile())
            .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        props.onPasteFiles(files);
        return;
      }
    }

    // A pasted [share=<id>][/share] token needs the same expand-to-embed
    // pass seedEditor runs on mount — plain text insertion leaves the
    // literal bbcode sitting in the DOM until something else forces a full
    // re-render (e.g. switching to the source tab and back).
    const text = dt.getData("text/plain");
    if (tab() === "wysiwyg" && editorRef && text && (/\[share[=\s][\s\S]*?\[\/share\]/i.test(text) || /\[card[=\s][\s\S]*?\[\/card\]/i.test(text))) {
      e.preventDefault();
      document.execCommand("insertText", false, text);
      const next = htmlToSource(editorRef.innerHTML, mime());
      editorRef.innerHTML = sourceToHtml(next, mime());
      domSig = `${mime()} ${next}`;
      hydrateShareEmbeds(editorRef);
      hydrateCardEmbeds(editorRef);
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editorRef);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
      props.onInput(next);
    }
  };

  // Every composer gets the tab bar (write/source) except chat's plain input.
  //
  // This wrapper must not be flex-shrunk: it doesn't clip (no overflow-clip
  // here), so a shrunk box still paints its toolbar at full size while the
  // NEXT SIBLING (AttachmentBar) is positioned by the shrunk nominal size —
  // and the two visually overlap. `shrink-0` prevents exactly that.
  //
  // It deliberately carries no min-height of its own. The surface below
  // already has `min-height: minH()`, and because the surface is
  // overflow-y-auto its automatic minimum size is 0 — so this box's `auto`
  // minimum resolves to "surface floor + the toolbar's real height", which is
  // precisely the wanted height. The previous code instead reserved
  // `minH + 150px`, a hand-picked worst-case toolbar allowance; whenever the
  // toolbar rendered shorter than 150px (i.e. nearly always) and the surface
  // was capped before it could absorb the difference, the remainder showed as
  // dead space under the toolbar.
  //
  // In fill mode the bounded ancestor supplies the height instead, so the
  // wrapper grows rather than sizing to content.
  return (
    <div
      ref={wrapperEl}
      class={`rich-editor flex flex-col ${props.fill ? "flex-1 min-h-0" : "shrink-0"}`}
    >
      {/* ── WYSIWYG surface ───────────────────────────────── */}
      <Show when={tab() === "wysiwyg"}>
        <div
          ref={seedEditor}
          contenteditable
          dir="ltr"
          onInput={(e) => onEditorInput(e as InputEvent)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onClick={onEditorClick}
          onBlur={onEditorBlur}
          data-placeholder={props.placeholder ?? t("editor.write_placeholder")}
          style={{ "min-height": minH(), "max-height": maxH() }}
          class={`${surfaceGrowClass()} overflow-y-auto rounded-t-lg p-3 outline-none text-sm text-txt bg-elevated
                 [&_img]:max-w-full [&_img]:h-auto
                 empty:before:content-[attr(data-placeholder)]
                 empty:before:text-muted empty:before:pointer-events-none
                 ${props.resizable ? "resize-y" : ""}`}
        />
      </Show>

      {/* ── Source textarea ───────────────────────────────── */}
      <Show when={tab() === "source"}>
        <textarea
          ref={textareaRef}
          value={props.body}
          onInput={onTextareaInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          style={{ "min-height": minH(), "max-height": maxH() }}
          class={`${surfaceGrowClass()} overflow-y-auto rounded-t-lg w-full p-3 text-sm font-mono text-txt bg-elevated outline-none ${props.resizable ? "resize-y" : "resize-none"}`}
          placeholder={
            mime() === "text/markdown"
              ? t("editor.markdown_source_placeholder")
              : mime() === "text/html"
                ? t("editor.html_source_placeholder")
                : t("editor.bbcode_source_placeholder")
          }
        />
      </Show>

      {/* ── Unified toolbar (wysiwyg + source tabs) — docked at the bottom
           of the surface so it stays visible while the surface above it
           scrolls internally past long content. ── */}
      <EditorToolbar
        level={props.capabilities.toolbar}
        latexMode={props.capabilities.latexMode}
        cardPicker={props.capabilities.cardPicker}
        tab={tab()}
        editorRef={() => editorRef}
        textareaRef={() => textareaRef}
        onSourceChange={(v) => { props.onInput(v); }}
      />

      {/* ── Image resize popup ───────────────────────────── */}
      <Show when={imgSel()}>
        <Portal>
          <div
            ref={popupRef}
            class="fixed z-[70] flex flex-col gap-1.5 px-2 py-1.5 rounded-lg border border-rim
                   bg-surface shadow-xl"
            style={popupStyle()}
            onMouseDown={(e) => {
              // Keep focus (and thus the live DOM) in the editor for the
              // buttons; the width/alt fields still need to take it.
              const tag = (e.target as HTMLElement).tagName;
              if (tag !== "INPUT" && tag !== "TEXTAREA") e.preventDefault();
            }}
          >
            <div class="flex items-center gap-1">
              <For each={[25, 50, 75] as const}>
                {(pct) => (
                  <button
                    type="button"
                    onClick={() => {
                      const el = imgSel()!.el;
                      const base = el.naturalWidth || el.getBoundingClientRect().width;
                      applyImgWidth((base * pct) / 100);
                    }}
                    class="px-1.5 py-0.5 rounded text-xs text-muted hover:bg-elevated hover:text-txt transition-colors"
                  >
                    {pct}%
                  </button>
                )}
              </For>
              <button
                type="button"
                onClick={() => applyImgWidth(null)}
                class="px-1.5 py-0.5 rounded text-xs text-muted hover:bg-elevated hover:text-txt transition-colors"
              >
                100%
              </button>
              <span class="w-px h-4 bg-rim mx-0.5" />
              <input
                type="number"
                min="16"
                title={t("editor.img_width")}
                value={widthVal()}
                onInput={(e) => setWidthVal(e.currentTarget.value)}
                onChange={(e) => {
                  const w = parseInt(e.currentTarget.value, 10);
                  if (w > 0) applyImgWidth(w);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const w = parseInt(widthVal(), 10);
                    if (w > 0) applyImgWidth(w);
                  }
                }}
                class="w-16 px-1.5 py-0.5 text-xs rounded border border-rim bg-elevated text-txt
                       outline-none focus:border-accent/50"
              />
              <span class="text-[0.625rem] text-muted">px</span>
            </div>
            <textarea
              placeholder={t("editor.img_alt")}
              title={t("editor.img_alt")}
              rows={4}
              value={altVal()}
              onInput={(e) => setAltVal(e.currentTarget.value)}
              onChange={(e) => applyImgAlt(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  applyImgAlt(altVal());
                }
              }}
              class="w-full min-w-[220px] px-2 py-1 text-xs rounded border border-rim bg-elevated text-txt
                     outline-none focus:border-accent/50 resize-none"
            />
          </div>
        </Portal>
      </Show>

    </div>
  );
}
