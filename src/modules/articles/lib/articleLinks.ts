// Article URL helpers — slug-preferred, falling back to the raw item uuid
// when no slug has been set.

export interface ArticleLinkable {
  uuid: string;
  slug?: string;
}

/** Client route path for viewing an article: /articles/:nick/:slugOrUuid */
export function articlePath(nick: string, article: ArticleLinkable): string {
  return `/articles/${nick}/${article.slug || article.uuid}`;
}

/** Absolute, publicly-resolvable URL for an article (slug-preferred). */
export function articleShareUrl(
  nick: string,
  article: ArticleLinkable & { viewUrl?: string },
): string {
  return article.viewUrl || `${window.location.origin}${articlePath(nick, article)}`;
}

// Plain-text excerpt from rendered (HTML) body — same approach as
// ArticlesView.tsx's list-card excerpt, used here only as a fallback when
// the article has no explicit summary.
function excerptFromBody(body: string, maxLen = 200): string {
  const plain = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

export function buildArticleShareBody(
  nick: string,
  article: ArticleLinkable & {
    title: string;
    summary?: string;
    body?: string;
    viewUrl?: string;
    iid?: number;
    item_private?: number;
  },
): string {
  // Public articles embed like classic Hubzilla: the compact [share=<id>]
  // token is expanded server-side (Item.php expandShareTags) into a full
  // [share …]…[/share] block linking at /articles/<nick>/<slug>. [share]
  // refuses item_private outright, so restricted articles keep the older
  // link + quote form rather than dead-ending on a 422 at save.
  if (article.iid && !article.item_private) {
    return `\n[share=${article.iid}][/share]\n`;
  }

  const link  = articleShareUrl(nick, article);
  const title = article.title?.trim() || link;
  let body = `[url=${link}]${title}[/url]`;
  const quoteText = article.summary?.trim() || excerptFromBody(article.body ?? "");
  if (quoteText) body += `\n\n[quote]${quoteText}[/quote]`;
  return body;
}
