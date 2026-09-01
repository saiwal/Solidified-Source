import { marked } from "marked";
import DOMPurify from "dompurify";
import { bbcodeToHtml } from "@utsukta/spa-core/lib/bbcode";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { SCAN_RE, MATCH_RE, loadKatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { emojify } from "@utsukta/spa-core/lib/emojify";
import { getEmojiMap } from "@utsukta/spa-core/store/emoji-store";
import { useEmojiAsImages } from "@utsukta/spa-core/store/emoji-as-images";
import type { MimeType } from "../types/editor.types";
import { protectBbcode, restoreBbcode, isBlockBbcode, encodeRaw } from "./markdownProtect";

/** Convert source-format body to HTML for the WYSIWYG editor. */
export function sourceToHtml(body: string, mimetype: MimeType): string {
  const html =
    mimetype === "text/html" ? body :
    mimetype === "text/markdown" ? markdownToEditorHtml(body) :
    bbcodeToEditorHtml(body);
  return useEmojiAsImages()() ? emojify(html, getEmojiMap()) : html;
}

/**
 * Markdown for the WYSIWYG surface.
 *
 * A markdown body still carries bbcode — AttachmentBar inserts [img]/[zmg]/
 * [zrl], the card picker inserts [card=<id>], the submit path appends
 * [attachment] — and handing that to marked/Turndown destroys it. So bbcode is
 * lifted out first (markdownProtect.ts) and re-emitted here as non-editable
 * embeds carrying their own source, which htmlToSource reads back verbatim.
 *
 * Compact [share=<id>] / [card=<id>] tokens reuse the same embed shapes the
 * bbcode path uses, so hydrateShareEmbeds()/hydrateCardEmbeds() fill in their
 * previews here too without any extra wiring.
 */
function markdownToEditorHtml(body: string): string {
  const { src, raws } = protectBbcode(body);
  const html = marked.parse(src) as string;

  return restoreBbcode(html, raws, (raw) => {
    const share = /^\[share=(\d+)\]\s*\[\/share\]$/i.exec(raw);
    if (share) return compactShareEmbed(share[1]);

    const card = /^\[card=(\d+)\]\s*\[\/card\]$/i.exec(raw);
    if (card) return compactCardEmbed(card[1]);

    // Block-level bbcode must not render as a block inside marked's <p>.
    const tag = isBlockBbcode(raw) ? "div" : "span";
    const cls = isBlockBbcode(raw) ? "bb-raw-embed bb-raw-block" : "bb-raw-embed";
    return `${ZWSP}<${tag} class="${cls}" data-bb-raw="${encodeRaw(raw)}" contenteditable="false">${renderShareHtml(raw)}</${tag}>${ZWSP}`;
  });
}

// ---------------------------------------------------------------------------
// [share] protection
//
// Share blocks must survive WYSIWYG round-trips byte-for-byte — the rendered
// .bb-share card that bbcodeToHtml produces cannot be inverted by
// htmlToSource. So before conversion they are swapped for sentinels, and
// afterwards re-emitted as non-editable embeds that render the reshared
// content but map straight back to their bbcode in htmlToSource (via the
// data-share-id / data-share-raw attributes — the rendered children are
// display-only and ignored).
//
// Blocks are located with a depth-aware scan, not a non-greedy regex: nested
// reshares contain inner [/share] closers, and matching the first one would
// split the block and leave a stray outer [/share] behind.
// ---------------------------------------------------------------------------

// Zero-width spaces around the embed give the caret a landing spot on both
// sides of the non-editable element (otherwise text can only be typed before
// it when it sits at the edge of the contenteditable). htmlToSource strips
// them back out of text nodes.
const ZWSP = "\u200B";
const shareEmbed = (attrs: string, innerHtml: string) =>
  `${ZWSP}<div class="bb-share-embed" ${attrs} contenteditable="false">${innerHtml}</div>${ZWSP}`;

const renderShareHtml = (block: string) => {
  const html = DOMPurify.sanitize(bbcodeToHtml(block));
  return useEmojiAsImages()() ? emojify(html, getEmojiMap()) : html;
};

// Expanded blocks for compact [share=<id>] tokens, fetched once per id —
// re-seeds (tab switches, external body updates) then render synchronously.
const shareBlockCache = new Map<string, string>();

/**
 * Fetch and render the reshared content into any not-yet-hydrated compact
 * share embeds under `root`. Call after writing sourceToHtml output into the
 * contenteditable. Only mutates the embeds' display children — the bbcode
 * mapping lives in their attributes, so the body source is unaffected.
 */
export function hydrateShareEmbeds(root: HTMLElement): void {
  const pending = root.querySelectorAll<HTMLElement>(
    "[data-share-id][data-share-pending]",
  );
  pending.forEach(async (el) => {
    const id = el.getAttribute("data-share-id");
    if (!id) return;
    el.removeAttribute("data-share-pending");
    try {
      let block = shareBlockCache.get(id);
      if (!block) {
        const res = await apiFetch(`/spa/item/${id}/sharepreview`);
        const json = (await res.json()) as { success?: boolean; bbcode?: string };
        if (!json?.success || !json.bbcode) return;
        block = json.bbcode;
        shareBlockCache.set(id, block);
      }
      el.innerHTML = renderShareHtml(block);
    } catch {
      /* placeholder stays */
    }
  });
}

// ---------------------------------------------------------------------------
// [card] protection
//
// Only the compact compose-time [card=<id>] token: a stored card embed is a
// [share] block (see Concerns/EmbedsCards.php), so the share scan above
// already covers it. Same contract otherwise — the token becomes a sentinel
// before conversion, then a non-editable embed mapping back via data-card-id.
// ---------------------------------------------------------------------------

const cardEmbed = (attrs: string, innerHtml: string) =>
  `${ZWSP}<div class="bb-card-embed-wrap" ${attrs} contenteditable="false">${innerHtml}</div>${ZWSP}`;

// Expanded blocks for compact [card=<id>] tokens, fetched once per id.
const cardBlockCache = new Map<string, string>();

/**
 * Compact [share=<id>] / [card=<id>] tokens as non-editable embeds. Shared by
 * the bbcode and markdown branches so hydrateShareEmbeds()/hydrateCardEmbeds()
 * recognise them identically in both.
 */
const compactShareEmbed = (id: string) => {
  const cached = shareBlockCache.get(id);
  return cached
    ? shareEmbed(`data-share-id="${id}"`, renderShareHtml(cached))
    : shareEmbed(
        `data-share-id="${id}" data-share-pending="1"`,
        `<div class="bb-share bb-share-compact">\u{1F501} Shared post #${id}</div>`,
      );
};

const compactCardEmbed = (id: string) => {
  const cached = cardBlockCache.get(id);
  return cached
    ? cardEmbed(`data-card-id="${id}"`, renderShareHtml(cached))
    : cardEmbed(
        `data-card-id="${id}" data-card-pending="1"`,
        `<div class="bb-card-compact">\u{1F5C2}\uFE0F Card embed #${id}</div>`,
      );
};

/**
 * Fetch and render the embedded card into any not-yet-hydrated compact card
 * embeds under `root`. Call after writing sourceToHtml output into the
 * contenteditable. Only mutates the embeds' display children — the bbcode
 * mapping lives in their attributes, so the body source is unaffected.
 */
export function hydrateCardEmbeds(root: HTMLElement): void {
  const pending = root.querySelectorAll<HTMLElement>(
    "[data-card-id][data-card-pending]",
  );
  pending.forEach(async (el) => {
    const id = el.getAttribute("data-card-id");
    if (!id) return;
    el.removeAttribute("data-card-pending");
    try {
      let block = cardBlockCache.get(id);
      if (!block) {
        const res = await apiFetch(`/spa/item/${id}/cardpreview`);
        const json = (await res.json()) as { success?: boolean; bbcode?: string };
        if (!json?.success || !json.bbcode) return;
        block = json.bbcode;
        cardBlockCache.set(id, block);
      }
      el.innerHTML = renderShareHtml(block);
    } catch {
      /* placeholder stays */
    }
  });
}

// ---------------------------------------------------------------------------
// Live LaTeX chips ($…$ / $$…$$)
//
// Mirrors the [share] embed approach above: a rendered KaTeX chip can't be
// inverted back to its $…$ source by htmlToSource, so the raw source is
// carried in a data-latex-raw attribute on a non-editable element and
// htmlToSource restores it verbatim (see unwrapLatexEmbeds in htmlToSource.ts).
// ---------------------------------------------------------------------------

const latexEmbed = (isBlock: boolean, raw: string, innerHtml: string) =>
  `${ZWSP}<${isBlock ? "div" : "span"} class="bb-latex-embed" data-latex-raw="${encodeURIComponent(raw)}" contenteditable="false">${innerHtml}</${isBlock ? "div" : "span"}>${ZWSP}`;

/**
 * Walks `root`'s text nodes (skipping code/pre/script/style/already-rendered
 * math) and replaces any $…$ / $$…$$ found with a rendered, non-editable
 * KaTeX chip — the WYSIWYG-editing counterpart to hydrateLatex() (which does
 * the same thing for already-published, read-only pages).
 */
export function hydrateLatexEmbeds(root: HTMLElement): void {
  if (!SCAN_RE.test(root.textContent ?? "")) return;

  void loadKatex().then((katex) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.parentElement;
        if (el?.closest("code, pre, script, style, .katex")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const targets: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) targets.push(n as Text);

    for (const textNode of targets) {
      const text = textNode.textContent ?? "";
      MATCH_RE.lastIndex = 0;
      if (!MATCH_RE.test(text)) continue;

      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      MATCH_RE.lastIndex = 0;
      while ((m = MATCH_RE.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const isBlock = m[1] !== undefined;
        const expr = (isBlock ? m[1] : m[2]) ?? "";
        let inner: string;
        try {
          inner = katex.renderToString(expr.trim(), {
            displayMode: isBlock,
            throwOnError: false,
            output: "html",
          });
        } catch {
          inner = m[0];
        }
        const wrap = document.createElement("div");
        wrap.innerHTML = latexEmbed(isBlock, m[0], inner);
        while (wrap.firstChild) frag.appendChild(wrap.firstChild);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.replaceWith(frag);
    }
  });
}

/** End offset (exclusive) of the balanced [share]…[/share] block opening at `start`, or -1. */
function findShareEnd(s: string, start: number): number {
  const tokRe = /\[share[=\s]|\[\/share\]/gi;
  tokRe.lastIndex = start;
  let depth = 0;
  let t: RegExpExecArray | null;
  while ((t = tokRe.exec(s))) {
    if (t[0].toLowerCase() === "[/share]") {
      depth--;
      if (depth <= 0) return t.index + t[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

function bbcodeToEditorHtml(body: string): string {
  const raws: string[] = [];
  let src = "";
  let cursor = 0;

  const openRe = /\[share[=\s]/gi;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(body))) {
    const end = findShareEnd(body, m.index);
    if (end < 0) break; // unbalanced — leave the rest untouched

    src += body.slice(cursor, m.index);
    const block = body.slice(m.index, end);

    // Compact compose-time token [share=<id>][/share] — anything else
    // (full attribute blocks, nested trees) is preserved verbatim.
    const compact = block.match(/^\[share=(\d+)\]\s*\[\/share\]$/i);
    if (compact) {
      src += `\x01SHARE:${compact[1]}\x01`;
    } else {
      raws.push(block);
      src += `\x01SHARERAW:${raws.length - 1}\x01`;
    }

    cursor = end;
    openRe.lastIndex = end;
  }
  src += body.slice(cursor);

  // Compact [card=<id>] tokens. Only this form needs protecting: a *stored*
  // card embed is a [share] block, already claimed by the scan above.
  src = src.replace(/\[card=(\d+)\]\s*\[\/card\]/gi, (_m, id) => `\x01CARD:${id}\x01`);

  let html = bbcodeToHtml(src);

  html = html.replace(/\x01SHARE:(\d+)\x01/g, (_m, id) => compactShareEmbed(id));
  html = html.replace(/\x01SHARERAW:(\d+)\x01/g, (_m, i) => {
    const block = raws[Number(i)] ?? "";
    return shareEmbed(
      `data-share-raw="${encodeURIComponent(block)}"`,
      renderShareHtml(block),
    );
  });

  html = html.replace(/\x01CARD:(\d+)\x01/g, (_m, id) => compactCardEmbed(id));

  return html;
}
