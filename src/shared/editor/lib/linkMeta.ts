/**
 * Shared client for GET /spa/link-meta — the server-side page scraper behind
 * the card composer's Link template and the toolbar's insert-URL button.
 *
 * Scraping is server-side because CORS makes fetching an arbitrary page from
 * the browser impossible, and because the endpoint carries the SSRF vetting
 * (see Api/Handlers/Linkmeta.php).
 */
export interface LinkMeta {
  title: string;
  text: string;
  image: string;
}

/** Returns null on any failure — callers fall back to a bare link. */
export async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    // Imported lazily so this module's pure formatters below stay loadable
    // without the fetch/csrf chain — see linkMeta.test.ts.
    const { apiFetch } = await import("@utsukta/spa-core/lib/fetch");
    const res = await apiFetch(`/spa/link-meta?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data) return null;
    return {
      title: String(data.title ?? ""),
      text: String(data.text ?? ""),
      image: String(data.image ?? ""),
    };
  } catch {
    return null;
  }
}

// A scraped title/description is remote text. Square brackets would close the
// surrounding tag early ("[/url]" in a title breaks out of the link), so drop
// them rather than trying to escape bbcode, which has no escape syntax.
const safeBb = (s: string) => s.replace(/[[\]]/g, "").trim();

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * A link preview as bbcode — thumbnail, titled link, then the summary as a
 * quote. Each line is omitted when its data is missing, so an unscrapeable
 * URL degrades to the plain [url] link the button always produced.
 */
export function linkMetaToBbcode(url: string, meta: LinkMeta | null): string {
  const label = safeBb(meta?.title ?? "") || url;
  const lines: string[] = [];
  if (meta?.image) lines.push(`[url=${url}][img]${meta.image}[/img][/url]`);
  lines.push(`[url=${url}]${label}[/url]`);
  if (meta?.text) lines.push(`[quote]${safeBb(meta.text)}[/quote]`);
  return lines.join("\n");
}

/**
 * The same preview as HTML for the WYSIWYG tab. Deliberately mirrors
 * linkMetaToBbcode tag for tag: htmlToSource maps <a>/<img>/<blockquote> back
 * to [url]/[img]/[quote], so switching tabs after inserting is lossless.
 */
export function linkMetaToHtml(url: string, meta: LinkMeta | null): string {
  const href = escapeHtml(url);
  const label = escapeHtml(meta?.title?.trim() || url);
  const parts: string[] = [];
  if (meta?.image) {
    parts.push(`<a href="${href}"><img src="${escapeHtml(meta.image)}" alt=""></a>`);
  }
  parts.push(`<a href="${href}">${label}</a>`);
  if (meta?.text) parts.push(`<blockquote>${escapeHtml(meta.text)}</blockquote>`);
  // A trailing break leaves the caret outside the blockquote, so the next
  // thing typed isn't swallowed into the quote.
  return parts.join("<br>") + "<br>";
}
