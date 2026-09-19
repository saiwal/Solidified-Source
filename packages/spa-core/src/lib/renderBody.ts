import DOMPurify from "dompurify";
import { marked } from "marked";
import { bbcodeToHtml, type BbcodeOptions } from "./bbcode";
import { normalizeMime } from "./mimetypes";
import { zid, zidifyLinks } from "./zid";

// The single body -> HTML entry point, mirroring core's prepare_text()
// (include/text.php:2083). Hubzilla never converts between formats: a body is
// stored raw in the format it was authored in and item.mimetype says how to
// render it, so every display site has to make this same choice.
//
// Sanitisation differs per format, exactly as it does server-side:
//  - text/html was already run through HTMLPurifier at save time by
//    z_input_filter(), which is why core's prepare_text() passes it straight
//    through. We still DOMPurify it, since a body can also reach us from a
//    federated peer that never went through our save path.
//  - text/markdown is stored purified but htmlspecialchars-escaped; the API
//    un-escapes it on read (ContentTypes::decode), so what arrives here is
//    markdown source ready for the parser.
//  - text/plain and application/x-pdl are escaped, never parsed — core does
//    escape_tags() for both.
//
// `sanitize` is injectable because the stream uses a stricter allowlist than
// the DOMPurify default (see lib/sanitize.ts); everything else wants the
// default, which permits the tables and headings markdown emits.
// Core's escape_tags() is htmlspecialchars(ENT_COMPAT, double_encode: false),
// so it is idempotent — and it has to be, because text/plain is escaped once
// at save by z_input_filter() and again at display by prepare_text(). Escaping
// an existing entity's '&' a second time would show the reader a literal
// "&lt;b&gt;" instead of "<b>". bbcode.ts has its own escapeHtml() which does
// double-encode; that is correct for its callers and wrong for this one.
// Hubzilla marks a bookmarkable link by prefixing it with a literal "#^", and
// bbcode.ts renders that marker as its own span (as core's include/bbcode.php
// does). Shown to a reader it is just markup leaking into prose — core ships the
// `bookmarker` addon precisely to replace it with something clickable, and the SPA
// injects its own per-link button (src/modules/bookmarks/candidates.ts). So strip
// it here, at the display boundary.
//
// Deliberately NOT removed from bbcodeToHtml(): the rich editor round-trips
// through bbcodeToHtml() -> htmlToSource() on every blur, and htmlToSource's
// `case "a"` emits a bare [url=…], so this span's text content is the only thing
// carrying "#^" back into the source. Drop it there and editing a post would
// silently destroy its TERM_BOOKMARK term. The editor calls bbcodeToHtml()
// directly and never comes through here, which is what makes this the right seam.
function stripBookmarkMarkers(html: string): string {
  return html.replace(/<span class="bookmark-identifier">#\^<\/span>\s*/g, "");
}

function escapeTags(s: string): string {
  return s
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#[0-9]+;|#[xX][0-9a-fA-F]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// bbcode -> HTML for *display*: adds the observer's zid, the way core's
// prepare_text() does. Every display site that isn't a post body (event
// descriptions, chat, cards, articles, profiles, decrypted [crypt] payloads)
// goes through here rather than calling bbcodeToHtml() raw, so none of them
// can quietly lose access to an ACL-restricted image on another hub.
//
// The editor deliberately does NOT use it: it round-trips bbcodeToHtml() ->
// htmlToSource() on every blur and would write the zid back into the stored
// source.
export function bbcodeDisplay(text: string, opts?: BbcodeOptions): string {
  return zidifyLinks(bbcodeToHtml(text, { zidResolver: zid, ...opts }));
}

export function renderBody(
  body: string,
  mimetype?: string | null,
  opts?: BbcodeOptions,
  sanitize: (html: string) => string = (html) => DOMPurify.sanitize(html),
): string {
  switch (normalizeMime(mimetype)) {
    case "text/html":
      return sanitize(body);

    case "text/markdown":
      return sanitize(marked.parse(body, { async: false }) as string);

    // Comanche layout source. Core escapes rather than interprets it here
    // (prepare_text's `case 'application/x-pdl'`), and so do we — the SPA has
    // no Comanche renderer, it uses widget templates instead.
    case "application/x-pdl":
    case "text/plain":
      return `<pre class="whitespace-pre-wrap">${escapeTags(body)}</pre>`;

    // Rendered server-side by eval() in core; there is no client equivalent
    // and rendering the source would leak the channel's PHP. Callers that care
    // link out to the classic UI instead.
    case "application/x-php":
      return "";

    // 'text/bbcode' and the empty string, which the item.mimetype column
    // defaults to and core's prepare_text() treats as bbcode.
    default:
      return sanitize(stripBookmarkMarkers(bbcodeDisplay(body, opts)));
  }
}

// True when renderBody() cannot produce the body and the caller should offer a
// link to the classic UI instead of an empty panel.
export function needsServerRender(mimetype?: string | null): boolean {
  return normalizeMime(mimetype) === "application/x-php";
}
