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
 * A body that fails isn't locked out: the toggle asks before switching, so
 * the writer chooses the rewrite (see createWysiwygGate).
 */
import { createEffect, createMemo, createSignal, on, untrack, type Accessor } from "solid-js";
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
 * Content the visual surface would *delete*, not just reformat: sourceToHtml
 * sanitizes, so these never reach the DOM and never come back out of it.
 */
const LOST = /<(script|style|iframe|form|object|embed|link|meta|input|button|select|textarea)\b/i;

/**
 * The Write tab's availability, decided at mount and again whenever the format
 * picker changes the mimetype — deliberately *not* per keystroke. The check
 * runs marked, DOMPurify and Turndown over the whole document, and a tab that
 * appeared and vanished as you typed would be worse than either answer.
 *
 * - `available`: the surface may be used — the body round-trips cleanly, or
 *   the writer accepted the rewrite (`force`).
 * - `mode`: what the visual toggle offers when it isn't available yet —
 *   "confirm" (switching would normalise some formatting: ask first),
 *   "blocked" (switching would delete scripts/styles/embeds: refuse), or
 *   "never" (this format has no visual form here; no toggle at all).
 *
 * `strict` runs the check on bbcode too. Off everywhere a rewrite merely
 * re-spells an item; on for wiki pages, which core git-versions, so any
 * normalisation would show up as a whole-file change in the page history.
 */
export interface WysiwygGate {
  available: Accessor<boolean>;
  mode: Accessor<"clean" | "confirm" | "blocked" | "never">;
  force: () => void;
}

export function createWysiwygGate(
  body: Accessor<string>,
  mime: Accessor<MimeType>,
  allowNonBbcode?: boolean,
  strict = false,
): WysiwygGate {
  const mode = createMemo(
    on(mime, (m) => {
      if (!canUseWysiwyg(m, allowNonBbcode)) return "never" as const;
      const b = untrack(body);
      if ((m === "text/bbcode" && !strict) || roundTripsCleanly(b, m)) return "clean" as const;
      return LOST.test(b) ? ("blocked" as const) : ("confirm" as const);
    }),
  );
  const [forced, setForced] = createSignal(false);
  // A new format is a new question.
  createEffect(on(mime, () => setForced(false), { defer: true }));
  return {
    available: () => mode() === "clean" || (forced() && mode() === "confirm"),
    mode,
    force: () => setForced(true),
  };
}
