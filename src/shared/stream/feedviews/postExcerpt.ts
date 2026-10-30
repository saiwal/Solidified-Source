// src/shared/stream/feedviews/postExcerpt.ts
// Shared text/image extraction for the card-based feed views (Newspaper,
// Timeline, Scrapbook) — none of them render the full post body via
// PostCard, so they each need a plain-text teaser and an optional hero image.
import type { Post } from "@utsukta/spa-core/types/post.types";
import { parseEventData } from "@utsukta/spa-core/lib/activity.mapper";

function decodeEntities(s: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

// Event posts embed [event-summary]/[event-description]/… bbcode tags
// straight in the body — stripping the raw body would leak those tags as
// literal text, so event posts tease the description instead.
export function excerptOf(post: Pick<Post, "body" | "bodyNsfw" | "eventData">, maxLen = 200): string {
  if (post.bodyNsfw) return "Hidden content — open to view";
  const ev = post.eventData ?? (post.body.includes("[event-summary]") ? parseEventData(post.body) : undefined);
  // Emoji shortcodes (":cat_with_wry_smile:") are noise in a plain-text teaser
  // and became the lead story's drop cap. Whitespace-bounded runs only, so
  // "10:30:45" survives.
  const text = stripHtml(ev ? (ev.description ?? "") : post.body)
    .replace(/(^|\s)(?::[a-z0-9_+-]+:)+(?=\s|$)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
}

// Skips decoration that isn't post content: the quoted author's avatar in a
// reshare header (bbcode.ts `share-avatar`) and inline emoji (emojify.ts).
// The regex reads the raw attribute, still entity-encoded ("?w=1&amp;h=2"),
// so decode it before it's handed to a JSX src.
export function firstImageSrc(body: string): string | undefined {
  for (const m of body.matchAll(/<img[^>]*>/gi)) {
    if (/class="[^"]*\b(share-avatar|emoji)\b/i.test(m[0])) continue;
    const src = m[0].match(/src="([^"]+)"/i)?.[1];
    if (src) return decodeEntities(src);
  }
}
