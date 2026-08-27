// Share-target factories — one per shareable entity, so every call site is a
// one-liner: openShare(shareTargetForPost(post)).
//
// Replaces the old per-module duplicates (articles/lib/articleLinks.ts and
// cards/lib/cardLinks.ts, which were identical apart from the path prefix).

import type { ShareTarget } from "@utsukta/spa-core/store/share";
import type { Post } from "@utsukta/spa-core/types/post.types";
import type { FileMeta } from "@/modules/files/api";
import type { Photo } from "@/modules/photos/api/api";
import type { WebPage } from "@/modules/webpages/api";

/** Absolute URL for an app-relative path. */
export const absUrl = (path: string): string => `${window.location.origin}${path}`;

/** WebDAV path for a cloud file/folder, from its display_path. */
export function davPath(nick: string, displayPath: string): string {
  const encoded = displayPath.split("/").map(encodeURIComponent).join("/");
  return `/cloud/${nick}/${encoded}`;
}

// ── Path helpers (slug-preferred, falling back to the raw item uuid) ──────────

export interface Linkable {
  uuid: string;
  slug?: string;
}

/** Client route path for viewing an article: /articles/:nick/:slugOrUuid */
export const articlePath = (nick: string, a: Linkable): string =>
  `/articles/${nick}/${a.slug || a.uuid}`;

/** Client route path for viewing a card: /cards/:nick/:slugOrUuid */
export const cardPath = (nick: string, c: Linkable): string =>
  `/cards/${nick}/${c.slug || c.uuid}`;

// Plain-text excerpt from a rendered (HTML) body — the same approach the
// article/card list cards use, here only as a fallback when the item carries
// no explicit summary.
export function excerptFromBody(body: string, maxLen = 200): string {
  const plain = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return "";
  return plain.length <= maxLen ? plain : plain.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

/**
 * BBCode body for resharing an item into a new post.
 *
 * Public items embed like classic Hubzilla: the compact [share=<id>] token is
 * expanded server-side (Item.php expandShareTags) into a full [share …]…[/share]
 * block. [share] refuses item_private outright, so restricted items keep the
 * older link + quote form rather than dead-ending on a 422 at save.
 */
export function buildShareBody(opts: {
  url: string;
  title?: string;
  quote?: string;
  iid?: number;
  itemPrivate?: number | boolean;
}): string {
  if (opts.iid && !opts.itemPrivate) return `\n[share=${opts.iid}][/share]\n`;

  const title = opts.title?.trim() || opts.url;
  let body = `[url=${opts.url}]${title}[/url]`;
  if (opts.quote?.trim()) body += `\n\n[quote]${opts.quote.trim()}[/quote]`;
  return body;
}

// ── Target factories ─────────────────────────────────────────────────────────

export function shareTargetForPost(post: Post): ShareTarget {
  // `permalink` is the immutable, federation-wide plink and may point at a
  // remote hub; only fall back to a local route when it's absent.
  const url = post.permalink || absUrl(`/display/${post.uuid}`);
  const quote = excerptFromBody(post.body ?? "");
  // Same privacy test PostCard uses to gate its reshare controls — the server
  // refuses to embed or announce a private item.
  const isPrivate = post.flags?.includes("private") ?? false;
  return {
    url,
    title: post.title?.trim() || post.authorName || url,
    summary: quote,
    postBody: buildShareBody({ url, title: post.title, quote, iid: post.iid, itemPrivate: isPrivate }),
    embed: post.iid && !isPrivate
      ? [{ labelKey: "share.embed_bbcode", code: `[share=${post.iid}][/share]` }]
      : undefined,
    lockview: post.iid ? { type: "item", id: post.iid } : undefined,
  };
}

type ArticleLike = Linkable & {
  title: string;
  summary?: string;
  body?: string;
  viewUrl?: string;
  iid?: number;
  item_private?: number;
};

export function shareTargetForArticle(nick: string, a: ArticleLike): ShareTarget {
  const url = a.viewUrl || absUrl(articlePath(nick, a));
  const quote = a.summary?.trim() || excerptFromBody(a.body ?? "");
  return {
    url,
    title: a.title?.trim() || url,
    summary: quote,
    postBody: buildShareBody({ url, title: a.title, quote, iid: a.iid, itemPrivate: a.item_private }),
  };
}

export function shareTargetForCard(nick: string, c: ArticleLike): ShareTarget {
  const url = c.viewUrl || absUrl(cardPath(nick, c));
  const quote = c.summary?.trim() || excerptFromBody(c.body ?? "");
  return {
    url,
    title: c.title?.trim() || url,
    summary: quote,
    // Cards never used [share=] — they have their own [card=] embed token,
    // and the link + quote form is what CardView has always posted.
    postBody: buildShareBody({ url, title: c.title, quote }),
    embed: c.iid ? [{ labelKey: "share.embed_bbcode", code: `[card=${c.iid}][/card]` }] : undefined,
  };
}

/** Swap the Hubzilla size suffix (-0/-1/-2/-3) in a photo URL. */
const variantSrc = (src: string, size: number) => src.replace(/-\d+(\.[^.]+)$/, `-${size}$1`);

type PhotoLike = Pick<Photo, "resource_id" | "title" | "description" | "src"> & { filename?: string };

export function shareTargetForPhoto(nick: string, p: PhotoLike): ShareTarget {
  const url = absUrl(`/photos/${nick}/image/${p.resource_id}`);
  const title = p.title?.trim() || p.filename || url;

  // A photo shares better as an inline image than as a bare link, so its post
  // body embeds the medium variant rather than going through buildShareBody().
  const medium = variantSrc(p.src, 2);
  let postBody = `[img]${medium}[/img]`;
  if (p.title) postBody += `\n\n[b]${p.title}[/b]`;
  if (p.description) postBody += `\n${p.description}`;

  return {
    url,
    title,
    summary: p.description?.trim(),
    postBody,
    embed: [{ labelKey: "share.embed_bbcode", code: `[zmg]${medium}[/zmg]` }],
    lockview: { type: "photo", id: p.resource_id },
  };
}

export function shareTargetForFile(nick: string, f: FileMeta): ShareTarget {
  const url = absUrl(davPath(nick, f.display_path));

  // Mirrors classic core's Info panel (Zotlabs/Storage/Browser.php): a set of
  // ready-to-paste BBCode snippets.
  const embed: ShareTarget["embed"] = [];
  if (!f.is_dir) {
    embed.push({ labelKey: "share.attachment_bbcode", code: `[attachment]${f.hash},${f.revision}[/attachment]` });
  }
  const media = f.is_photo ? "zmg"
    : f.filetype?.startsWith("video/") ? "zvideo"
    : f.filetype?.startsWith("audio/") ? "zaudio"
    : null;
  if (media) embed.push({ labelKey: "share.embed_bbcode", code: `[${media}]${url}[/${media}]` });
  embed.push({ labelKey: "share.link_bbcode", code: `[zrl=${url}]${f.filename}[/zrl]` });

  return {
    url,
    title: f.filename,
    postBody: `[zrl=${url}]${f.filename}[/zrl]`,
    embed,
    lockview: f.id && !f.is_dir ? { type: "attach", id: f.id } : undefined,
  };
}

export function shareTargetForWebpage(nick: string, w: WebPage): ShareTarget {
  const url = w.view_url || absUrl(`/page/${nick}/${w.pagelink}`);
  const title = w.title?.trim() || w.pagelink || url;
  return {
    url,
    title,
    postBody: buildShareBody({ url, title }),
  };
}
