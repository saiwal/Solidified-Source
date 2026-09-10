// src/modules/bookmarks/candidates.ts
//
// Which links in a post can be bookmarked.
//
// Core only ever offers the ones the author marked with #^[url]…[/url] (stored as
// TERM_BOOKMARK terms, surfaced here as `bookmarkLinks`). That means a link is
// only bookmarkable if whoever wrote the post thought to mark it — useless for
// the federated posts and plain [url] links that make up most of a stream. So we
// offer those too, unmarked, and let the reader choose.
//
// Works on the rendered body string rather than a live DOM so it stays a pure
// function: the body is already sanitised by the time it reaches a post.

export interface LinkCandidate {
  url: string;
  title: string;
  /** Author-marked (#^) — core's own notion of bookmarkable. Pre-selected. */
  marked: boolean;
}

const ANCHOR = /<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;

/** The named entities a sanitised body can carry. */
function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Collapse an anchor's inner HTML to plain text. */
function text(html: string): string {
  return decode(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Hashtags and mentions are rendered as ordinary links (to /search?tag=… and to
 * a channel), so without this every post would offer its tags as bookmarks. Keyed
 * on the link text, which holds for both the [url] and [zrl] spellings.
 */
function isTagOrMention(label: string, url: string): boolean {
  if (/^[#@!]/.test(label)) return true;
  return /[?&]tag=/.test(url) && /\/search\b/.test(url);
}

export function linkCandidates(
  body: string,
  bookmarkLinks: { url: string; title: string }[] = [],
): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  const seen = new Set<string>();

  // Marked links first and unconditionally — they are bookmarkable by the
  // author's decision, whether or not they survived into the rendered body.
  for (const b of bookmarkLinks) {
    const url = b.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: b.title?.trim() || url, marked: true });
  }

  for (const m of body.matchAll(ANCHOR)) {
    // Decoded, not raw: a query string renders as &amp;, and the server checks the
    // URL against the stored bbcode body, which holds a plain &.
    const url = decode((m[2] ?? m[3] ?? "").trim());
    // Only real web links: no mailto:, javascript:, data:, or bare fragments.
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;

    const label = text(m[4]);
    if (isTagOrMention(label, url)) continue;

    seen.add(url);
    out.push({ url, title: label || url, marked: false });
  }

  return out;
}

/**
 * Put a small "bookmark this" button immediately before every bookmarkable link
 * in a rendered body. It stands where Hubzilla's inert `#^` marker used to —
 * renderBody() strips that at the display boundary — so a marked link reads as an
 * affordance rather than as leaked markup, which is what core's `bookmarker`
 * addon does to the same links.
 *
 * The body reaching here is already sanitised, and the only thing added is this
 * fixed markup plus the link's own href, so nothing from the post can escape
 * through it. The URL rides in a data attribute and the title is looked up from
 * `candidates` at click time, so no post-supplied text is ever interpolated.
 */

/** Escape a URL for use inside a double-quoted attribute. */
function attr(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function injectBookmarkButtons(
  body: string,
  candidates: LinkCandidate[],
  label: string,
): string {
  if (!candidates.length) return body;
  const urls = new Set(candidates.map((c) => c.url));

  // Same ANCHOR pattern linkCandidates() scans with; replace() and matchAll()
  // each manage lastIndex themselves, so sharing the literal is safe.
  return body.replace(ANCHOR, (anchor, _q, dq, sq) => {
    const url = decode((dq ?? sq ?? "").trim());
    if (!urls.has(url)) return anchor;

    const l = attr(label);
    return (
      `<button type="button" class="bm-add" data-bm-url="${attr(url)}"` +
      ` aria-label="${l}" title="${l}">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"` +
      ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>` +
      `</button>` + anchor
    );
  });
}
