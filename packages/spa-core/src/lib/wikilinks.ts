// Own file so it is testable without the DOM (wikilinks.test.ts).
// [[Title]] / [[Title|label]] → a link to /link/<Title>, which the graph
// module resolves against the page's channel (Handlers/Links.php). Wiki pages
// arrive with these already converted by core. Text nodes only: tags (an
// alt="[[x]]") and <pre>/<code> blocks pass through untouched. Runs on
// sanitized output; the label is already-escaped text and the href is
// URI-encoded, so it adds nothing a sanitizer would have removed.
// [[article:X]] / [[card:X]] / [[page:X]] read as "X"; [[Wiki/Page]] keeps its wiki.
const shown = (target: string) => target.replace(/^\s*(?:article|card|page):\s*/i, "");

export function linkWikilinks(html: string): string {
  if (!html.includes("[[")) return html;
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>|<[^>]*>)/i)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g, (m, title: string, label?: string) =>
            // [[i]] / [[/i]] are bbcode list debris, not titles (Links.php skips them too).
            title.trim().length < 2 || title.trim().startsWith("/")
              ? m
              : `<a class="wikilink" href="/link/${encodeURIComponent(title.trim())}">${label ?? shown(title)}</a>`),
    )
    .join("");
}
