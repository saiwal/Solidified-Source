import DOMPurify from "dompurify";
import { marked } from "marked";
import { bbcodeToHtml, type BbcodeOptions } from "./bbcode";
import { normalizeMime } from "./mimetypes";

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
function escapeTags(s: string): string {
  return s
    .replace(/&(?![a-zA-Z][a-zA-Z0-9]*;|#[0-9]+;|#[xX][0-9a-fA-F]+;)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      return sanitize(bbcodeToHtml(body, opts));
  }
}

// True when renderBody() cannot produce the body and the caller should offer a
// link to the classic UI instead of an empty panel.
export function needsServerRender(mimetype?: string | null): boolean {
  return normalizeMime(mimetype) === "application/x-php";
}
