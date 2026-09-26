import type { MimeType } from "../types/editor.types";
import type { Attachment } from "./types";

/**
 * bbcode alt attribute, in the ONLY double-quoted form core understands:
 * bb_imgoptions() (include/bbcode.php) reads alt='…' or alt=&quot;…&quot; and
 * silently drops a raw alt="…" — which this editor used to emit, so alt text
 * vanished server-side and grew a pair of literal quotes on every WYSIWYG
 * round-trip here. &quot; over ' because alt text contains apostrophes.
 */
export function bbAlt(alt: string): string {
  // '[' / ']' end the tag; a literal quote would end the attribute.
  const clean = alt.replace(/[[\]]/g, "").replace(/&quot;|"/g, "'").replace(/\s+/g, " ").trim();
  return `alt=&quot;${clean}&quot;`;
}

/** Reads an alt attribute out of an [img …] tag's attribute string. */
export function readAlt(attrs: string): string {
  const m = /alt=(?:&quot;(.*?)&quot;|"([^"]*)"|'([^']*)')/i.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
}

// Matches [img]url[/img] and [img <attrs>]url[/img]
const IMG_RE = /\[img(?:\s+([^\]]*))?\](.+?)\[\/img\]/gi;
const ATTACH_RE = /\[attachment\](.+?)\[\/attachment\]/gi;

/**
 * Converts a BBCode attachment tag to the appropriate format for the current mimetype.
 * Input is always BBCode ([img]...[/img] or [img alt="..."]...[/img]).
 */
export function bbcodeToInsert(bbcode: string, mime: MimeType): string {
  if (mime === "text/bbcode") return bbcode;

  if (mime === "text/markdown") {
    return bbcode
      .replace(IMG_RE, (_, attrs: string | undefined, url: string) =>
        `![${readAlt(attrs ?? "")}](${url})`,
      )
      .replace(ATTACH_RE, (_, url: string) => `[attachment](${url})`);
  }

  // text/plain has no markup at all — anything else would be inserted
  // literally, so fall back to the bare URL.
  if (mime === "text/plain") {
    return bbcode
      .replace(IMG_RE, (_m, _attrs: string | undefined, url: string) => url)
      .replace(ATTACH_RE, (_m, url: string) => url);
  }

  // text/html
  return bbcode
    .replace(IMG_RE, (_, attrs: string | undefined, url: string) => {
      const alt = readAlt(attrs ?? "");
      return alt ? `<img src="${url}" alt="${alt}" />` : `<img src="${url}" />`;
    })
    .replace(ATTACH_RE, (_, url: string) => `<a href="${url}">${url}</a>`);
}

/**
 * Append inserted bbcode on its own line.
 *
 * The separator is skipped when the body is empty or already ends in a
 * newline: every composer used to append "\n" unconditionally, so inserting
 * into an empty composer produced "\n[zmg…]" — a leading <br>, i.e. a blank
 * line above the image — and inserting after a paragraph break produced two.
 */
export function appendInsert(body: string, bbcode: string): string {
  return body === "" || body.endsWith("\n") ? body + bbcode : body + "\n" + bbcode;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Rewrites the alt text of an attachment image that was already inserted into
 * the body (Insert snapshots the alt at click time — editing it afterwards
 * must patch the body too). The image is located by its unique insertUrl; a
 * body without a match is returned unchanged.
 */
export function patchInsertedAlt(body: string, att: Attachment, mime: MimeType): string {
  const url = att.insertUrl;
  if (!url) return body;
  const esc = escapeRe(url);
  // '[' and ']' would terminate the bbcode tag; '"' would terminate the attr.
  const alt = (att.altText ?? "").trim().replace(/[[\]"]/g, "");

  if (mime === "text/markdown") {
    return body.replace(new RegExp(`!\\[[^\\]]*\\]\\(${esc}\\)`, "g"), `![${alt}](${url})`);
  }
  if (mime === "text/html") {
    return body.replace(
      new RegExp(`<img[^>]*src="${esc}"[^>]*/?>`, "gi"),
      alt ? `<img src="${url}" alt="${alt}" />` : `<img src="${url}" />`,
    );
  }

  // bbcode — photo form: [zmg=url]label[/zmg]; the label doubles as alt text
  // and falls back to the filename, mirroring insertBBCode.
  body = body.replace(
    new RegExp(`\\[zmg=${esc}\\][^[]*\\[/zmg\\]`, "gi"),
    `[zmg=${url}]${alt || att.filename}[/zmg]`,
  );
  // bbcode — upload form: [img]url[/img] with optional attributes (width from
  // the resize popup must survive, so only the alt attribute is swapped out).
  body = body.replace(
    new RegExp(`\\[([zi])mg([^\\]]*)\\]${esc}\\[/[zi]mg\\]`, "gi"),
    (_m, tag: string, attrs: string) => {
      let a = attrs.replace(/\s*alt=(&quot;.*?&quot;|"[^"]*"|'[^']*')/i, "").trim();
      if (alt) a = a ? `${a} ${bbAlt(alt)}` : bbAlt(alt);
      return a ? `[${tag}mg ${a}]${url}[/${tag}mg]` : `[${tag}mg]${url}[/${tag}mg]`;
    },
  );
  return body;
}

/**
 * Embed tags for ready videos the user never clicked Insert on — appended on
 * submit, since without one the video (and its poster) only ever shows as an
 * [attachment] file chip. Classic core's wall_attach inserts [zvideo] itself;
 * this is the same default. A video already in the body is left alone.
 */
export function missingVideoEmbeds(
  body: string,
  atts: readonly Attachment[],
  insertBBCode: (id: string) => string,
): string {
  return atts
    .filter((a) => a.status === "ready" && a.isVideo && a.insertUrl && !body.includes(a.insertUrl))
    .map((a) => insertBBCode(a.id))
    .join("\n");
}

/**
 * Swaps the poster on an already-inserted [zvideo] of this attachment. Every
 * source format carries the tag as bbcode (bbcodeToInsert passes it through),
 * so there is one form to patch.
 */
export function patchInsertedPoster(body: string, att: Attachment): string {
  const url = att.insertUrl;
  if (!url) return body;
  const tag = att.posterUrl
    ? `[zvideo poster='${att.posterUrl}']${url}[/zvideo]`
    : `[zvideo]${url}[/zvideo]`;
  return body.replace(new RegExp(`\\[zvideo[^\\]]*\\]${escapeRe(url)}\\[/zvideo\\]`, "gi"), () => tag);
}
