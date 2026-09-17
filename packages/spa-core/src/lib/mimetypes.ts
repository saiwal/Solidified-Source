// The set of content formats a Hubzilla item body can be authored in.
//
// Core keeps this list in three places that have drifted apart
// (include/text.php mimetype_select(), include/import.php, and the wiki
// addon's own lists). Keep it in exactly one place here.
//
// Deliberately excluded from *authoring*: application/x-php (eval'd server-side
// at render, gated on channel_codeallowed) and application/x-pdl (Comanche;
// the SPA uses widget templates instead). Both still render — see renderBody.
export const CONTENT_TYPES = [
  "text/bbcode",
  "text/html",
  "text/markdown",
  "text/plain",
] as const;

export type MimeType = (typeof CONTENT_TYPES)[number];

// The item.mimetype column defaults to '' and core's prepare_text() treats
// that as bbcode (`case '':` falls through to the bbcode branch). Never
// normalise the empty value to anything else.
export function normalizeMime(mimetype?: string | null): string {
  return mimetype || "text/bbcode";
}

export function isAuthorable(mimetype: string): mimetype is MimeType {
  return (CONTENT_TYPES as readonly string[]).includes(mimetype);
}

// Whether the WYSIWYG surface may be used for this format.
//
// Only bbcode. The rich surface writes back through htmlToSource() on every
// keystroke, so any other format would be re-serialized from rendered HTML
// continuously: markdown would be rewritten by Turndown (losing setext
// headings, reference links, footnotes, raw HTML blocks), and text/plain has
// no branch there at all — it would come back as bbcode. Core makes the same
// call, enabling its rich editor only when the mimetype is text/bbcode
// (Editwebpage.php:160, Editblock.php:132).
export function supportsWysiwyg(mimetype?: string | null): boolean {
  return normalizeMime(mimetype) === "text/bbcode";
}

// Whether this surface may use the WYSIWYG tab for this format.
//
// Bbcode always. Markdown and HTML only where `allowNonBbcode` says so: posts
// and comments, whose body the server converts to bbcode on save so the round
// trip's normalisation never reaches stored content, and the composers that
// pair the flag with a per-body round-trip check (wysiwygSafe.ts). Wiki pages
// stay source-only regardless — core git-versions them.
//
// text/plain is never included: htmlToSource has no branch for it, so a plain
// body would come back as bbcode.
export function canUseWysiwyg(mimetype: string | null | undefined, allowNonBbcode?: boolean): boolean {
  const m = normalizeMime(mimetype);
  return (
    supportsWysiwyg(m) ||
    (!!allowNonBbcode && (m === "text/markdown" || m === "text/html"))
  );
}
