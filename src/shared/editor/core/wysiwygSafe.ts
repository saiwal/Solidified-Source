/**
 * Whether the WYSIWYG surface may be used for a body that is stored in the
 * format it was typed in.
 *
 * A post's Markdown is converted to bbcode on save, so the round trip's
 * normalisation never reaches storage and the surface is always safe. An
 * article, card, webpage, block or note stores the Markdown (or HTML) itself
 * — and the
 * surface re-serializes the whole document through htmlToSource on every
 * keystroke, so a construct Turndown cannot spell (setext headings, reference
 * links, raw HTML blocks, definition lists) would be silently rewritten just
 * by opening the Write tab.
 *
 * Rather than deciding that per composer, ask the body: run the trip and see
 * whether it comes back byte-for-byte. Content written in this editor's own
 * dialect passes (markdown-roundtrip.test.ts pins 33 such shapes); anything
 * imported or hand-written elsewhere falls back to source-only on its own.
 *
 * Wiki pages are excluded a level up (`nonBbcodeWysiwyg: false`) whatever this
 * says, because core git-versions them and a normalising edit would show up as
 * a whole-file rewrite in the page history.
 */
import { createMemo, on, untrack, type Accessor } from "solid-js";
import { canUseWysiwyg } from "@utsukta/spa-core/lib/mimetypes";
import { sourceToHtml } from "./sourceToHtml";
import { htmlToSource } from "./htmlToSource";
import type { MimeType } from "../types/editor.types";

/**
 * Does `body` survive one WYSIWYG round trip unchanged?
 *
 * The trip goes through a real element rather than string-to-string, because
 * that is what the editor does: RichEditor assigns `innerHTML` and later reads
 * it back, and the browser normalises markup on the way (attribute order and
 * quoting, implied tags, entity forms, self-closing tags). For text/html that
 * *is* the whole rewrite — htmlToSource hands HTML straight back — so a
 * string-only check would call every HTML body safe and then mangle it.
 */
export function roundTripsCleanly(body: string, mime: MimeType): boolean {
  if (!body.trim()) return true;
  try {
    const probe = document.createElement("div");
    probe.innerHTML = sourceToHtml(body, mime);
    return htmlToSource(probe.innerHTML, mime) === body;
  } catch {
    // A body the round trip can't even complete is the clearest possible
    // "don't edit this visually".
    return false;
  }
}

/**
 * The Write tab's availability, decided at mount and again whenever the format
 * picker changes the mimetype — deliberately *not* per keystroke. The check
 * runs marked, DOMPurify and Turndown over the whole document, and a tab that
 * appeared and vanished as you typed would be worse than either answer.
 *
 * Pass the same accessor to `<RichEditor wysiwygAvailable>` and to the source
 * toggle, so the button and the surface can't disagree.
 */
export function createWysiwygAvailable(
  body: Accessor<string>,
  mime: Accessor<MimeType>,
  allowNonBbcode?: boolean,
): Accessor<boolean> {
  return createMemo(
    on(mime, (m) =>
      canUseWysiwyg(m, allowNonBbcode) &&
      (m === "text/bbcode" || roundTripsCleanly(untrack(body), m)),
    ),
  );
}
