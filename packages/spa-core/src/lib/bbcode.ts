/**
 * bbcode.ts
 *
 * TypeScript port of Hubzilla's include/bbcode.php
 *
 * Converts Hubzilla-flavoured BBCode to HTML.
 *
 * Notable omissions / differences from PHP:
 *  - oembed fetching is async and opt-in via a custom embedResolver callback.
 *  - Map generation (bb_map_coords / bb_map_location) requires an external
 *    resolver callback; otherwise [map] becomes an <a class="map-embed"> that
 *    useOsmMap() turns into an embedded map (see lib/useOsmMap.ts).
 *  - SVG sanitisation is not performed (rely on DOMPurify in the caller).
 *  - PHP server-side helpers (z_root, zid, local_channel, App::*, …) are
 *    replaced by an `BbcodeOptions` context object you supply at call-time.
 *  - [app] / [element] / [crypt] / [poll] / [event] tags are partially
 *    supported — enough to not leave raw BBCode in the output.
 *  - [toc] tag emits a placeholder <ul class="toc"> without the jQuery plugin.
 *  - highlight.js integration for [code=lang] is opt-in via a callback.
 */

import { osmLink, osmSearchLink, parseCoord } from "./osm";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Observer {
  xchan_url: string;
  xchan_name: string;
  xchan_addr: string;
  xchan_photo_l: string;
}

export interface BbcodeOptions {
  /** Whether to try resolving oembed/embed tags (default: true) */
  tryOembed?: boolean;
  /** Whether to skip observer / channel-specific processing (default: false) */
  cache?: boolean;
  /** Open links in a new window (default: true) */
  newWin?: boolean;
  /** Drop all media tags ([img], [video], [audio] …) */
  dropMedia?: boolean;

  // Context
  /** Current logged-in observer (viewer), if any */
  observer?: Observer | null;
  /** Whether the viewer is the channel owner */
  isOwner?: boolean;
  /** Site root URL, e.g. "https://example.com" */
  siteRoot?: string;
  /** Site name */
  siteName?: string;
  /** Language code of the rendering context, e.g. "en" */
  language?: string;

  // Callbacks
  /**
   * Called for [url], [video], [audio] tags when tryOembed is true.
   * Return an HTML string to replace the tag, or null to fall back to a plain link.
   */
  oembedResolver?: (url: string) => string | null;
  /**
   * Called for [code=lang]…[/code] blocks.
   * Return highlighted HTML, or null to fall back to plain <pre><code>.
   */
  highlightResolver?: (lang: string, code: string) => string | null;
  /**
   * Called for [map=coords] / [map]location[/map].
   * Return an HTML string, or null to strip.
   */
  mapResolver?: (locationOrCoords: string, type: "coords" | "location") => string | null;
  /**
   * Resolve a ZRL/remote URL — corresponds to PHP zid().
   * Return the (possibly token-augmented) URL.
   */
  zidResolver?: (url: string) => string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape HTML special characters */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Random alphanumeric string of `len` characters */
function randomString(len = 10): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/** Base64-encode (browser) — handles full Unicode, not just Latin-1 */
function b64encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
function b64decode(s: string): string {
  return decodeURIComponent(escape(atob(s)));
}
// ---------------------------------------------------------------------------
// Code-block protection (prevents inner content being processed as BBCode)
// ---------------------------------------------------------------------------

const CODE_PROTECT_PREFIX = "b64.\x5e9e%25.";
const CODE_PROTECT_SUFFIX = ".b64.$9e%25";

function codeProtect(s: string): string {
  return CODE_PROTECT_PREFIX + b64encode(s) + CODE_PROTECT_SUFFIX;
}

function codeUnprotect(s: string): string {
  return s.replace(
    /b64\.\^9e%25\.([\s\S]*?)\.b64\.\$9e%25/g,
    (_m, payload) => b64decode(payload)
  );
}

// ---------------------------------------------------------------------------
// [noparse] / [nobb] / [pre] spacefying — hides nested tags from the parser
// ---------------------------------------------------------------------------

function bbSpacefy(content: string): string {
  return content.replace(/\[(.*?)\]/g, "[ $1 ]");
}

function bbUnspacefy(content: string): string {
  return content.replace(/\[ (.*?) \]/g, "[$1]");
}

function bbUnspacefyAndTrim(content: string): string {
  return content.replace(/\[ (.*?) \]/g, "[$1]");
}

// ---------------------------------------------------------------------------
// Image extraction (preserves data: URIs from being processed)
// ---------------------------------------------------------------------------

interface ExtractImagesResult {
  body: string;
  images: string[];
}

function bbExtractImages(body: string): ExtractImagesResult {
  const images: string[] = [];
  let result = body;
  let idx = 0;

  // Extract data: URIs — must happen before HTML escaping
  result = result.replace(/\[img[^\]]*\]data:([\s\S]*?)\[\/img\]/gi, (_m, data) => {
    const placeholder = `[$#saved_image${idx}#$]`;
    images[idx] = "data:" + data;
    idx++;
    return placeholder;
  });

  // Extract [img=url]alt[/img] and [zmg=url]alt[/zmg] blocks.
  //
  // These must be pulled out BEFORE HTML escaping and URL auto-linking so that:
  //   1. The alt text (which may contain bare https:// URLs) is not converted
  //      into <a> tags mid-tag by the auto-linker.
  //   2. The alt text may span multiple lines and contain any characters.
  //
  // We convert them to their final <img> HTML immediately and store that HTML
  // as the placeholder payload so bbReplaceImages can drop it in verbatim.
  const imgEqPattern = /\[([zi])mg=(https?:\/\/[^\]]*?)\]([\s\S]*?)\[\/[zi]mg\]/gi;
  result = result.replace(imgEqPattern, (_m, tag, src, alt) => {
    const placeholder = `[$#saved_image${idx}#$]`;
    const zCls = tag === "z" ? ' class="zrl"' : "";
    const cleanAlt = escapeHtml(alt.trim());
    images[idx] = `<img${zCls} style="max-width: 100%;" src="${src.trim()}" alt="${cleanAlt}" title="${cleanAlt}" loading="lazy" />`;
    idx++;
    return placeholder;
  });

  return { body: result, images };
}

function bbReplaceImages(body: string, images: string[]): string {
  let result = body;
  images.forEach((img, i) => {
    // If the stored value is already an <img> tag (extracted above), use it
    // directly; otherwise it's a data: URI needing the default wrapper.
    if (img.startsWith("<img")) {
      result = result.replace(`[$#saved_image${i}#$]`, img);
    } else {
      result = result.replace(
        `[$#saved_image${i}#$]`,
        `<img src="${img}" alt="Image/photo" loading="lazy" />`
      );
    }
  });
  return result;
}

// ---------------------------------------------------------------------------
// [share] block
// ---------------------------------------------------------------------------

function bbShareAttributes(
  attributes: string,
  content: string,
  _opts: BbcodeOptions
): string {
  const attr = (name: string, keepPlus = false) => {
    const m = attributes.match(new RegExp(`${name}='(.*?)'`, "i"));
    if (!m) return "";
    const val = keepPlus ? m[1] : m[1].replace(/\+/g, " ");
    return decodeURIComponent(val);
  };

  // Strip the block's own padding — bbcode shares arrive as "]\r\n…body…\r\n[/",
  // the HTML variant as "><br />…<br /></" — so the quote body doesn't open or
  // close with a blank line. Interior breaks are the reshared post's structure
  // and must survive.
  content = content.replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/gi, "");

  const author = attr("author");
  const link = attr("link");
  const avatar = attr("avatar");
  const profile = attr("profile");
  const posted = attr("posted", true);

  // Both this renderer and core's bb_ShareAttributes derive the kind of thing
  // being quoted from the link alone, which is why a card embed can be stored
  // as an ordinary [share] block and still render as a card in either theme.
  // Emitted as a class too, so the SPA can style each kind distinctly.
  const type = link.includes("/cards/")
    ? "card"
    : link.includes("/articles/")
    ? "article"
    : "post";

  const reldate = posted
    ? new Date(posted).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";

  const avatarHtml = avatar
    ? `<img src="${escapeHtml(avatar)}" class="share-avatar" alt="${escapeHtml(author)}" />`
    : `<div class="share-avatar share-avatar-init">${escapeHtml(author[0]?.toUpperCase() ?? "?")}</div>`;

  const linkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M7 7h10v10"/></svg>`;

  // No newlines in the emitted markup: the last step of bbcode() turns every
  // newline into <br />, so an indented template would render its own
  // indentation as blank lines. (The interpolated body keeps its newlines --
  // those are the reshared post's paragraph breaks.)
  return (
    `<div class="bb-share bb-share-${type}">` +
      `<div class="bb-share-header">` +
        avatarHtml +
        `<a class="bb-share-name" href="${escapeHtml(profile)}">${escapeHtml(author)}</a>` +
        `<span class="bb-share-sep">·</span>` +
        `<time class="bb-share-date" datetime="${escapeHtml(posted)}">${escapeHtml(reldate)}</time>` +
        `<a class="bb-share-link" href="${escapeHtml(link)}" title="View original ${escapeHtml(type)}" target="_blank" rel="noopener noreferrer">${linkIcon}</a>` +
      `</div>` +
      `<div class="bb-share-body">${content}</div>` +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// [event-summary]/[event-description]/[event-start]/[event-finish] block
//
// Core Hubzilla embeds these tags directly in an event item's body. A
// top-level event post never reaches this renderer for display — the SPA
// intercepts it via parseEventData()/EventCard before bbcode() output is
// shown — but a *reshared* event ([share]…[/share] wrapping the original
// body) has no such interception; without this, the tags leak through as
// literal bracket text inside the share quote. Runs before [b]/[img]/[url]
// processing below, so the raw description content still gets converted
// normally once it's wrapped here.
// ---------------------------------------------------------------------------

function bbEventAttributes(summary: string, description: string, start: string, finish: string): string {
  const fmtDate = (raw: string) => {
    const d = new Date(raw.replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };
  const dateLine = finish ? `${fmtDate(start)} → ${fmtDate(finish)}` : fmtDate(start);

  return (
    `<div class="bb-event">` +
      `<div class="bb-event-title">${summary}</div>` +
      `<div class="bb-event-date">📅 ${escapeHtml(dateLine)}</div>` +
      (description ? `<div class="bb-event-desc">${description}</div>` : "") +
    `</div>`
  );
}

// ---------------------------------------------------------------------------
// [style] sanitiser
// ---------------------------------------------------------------------------

const STYLE_WHITELIST: Record<string, Record<string, number> | 0> = {
  color: 0,
  "background-color": 0,
  padding: { px: 100, "%": 0, em: 2, ex: 2 },
  margin: { px: 100, "%": 0, em: 2, ex: 2 },
  border: { px: 100, "%": 0, em: 2, ex: 2 },
  float: 0,
  clear: 0,
  "text-decoration": 0,
};

function bbSanitizeStyle(cssString: string, content: string): string {
  const parts = cssString.split(";").filter(Boolean);
  const sanitized: string[] = [];

  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx < 0) continue;
    const key = part.slice(0, colonIdx).trim();
    let value = part.slice(colonIdx + 1).trim();

    if (!(key in STYLE_WHITELIST)) continue;
    const limits = STYLE_WHITELIST[key];

    if (limits !== 0) {
      for (const [unit, max] of Object.entries(limits as Record<string, number>)) {
        if (max > 0) {
          value = value.replace(new RegExp(`(\\d+(?:\\.\\d+)?)${unit}`, "gi"), (_m, n) => {
            const num = parseFloat(n);
            return `${Math.min(num, max)}${unit}`;
          });
        }
      }
    }

    sanitized.push(`${key}: ${value}`);
  }

  if (!sanitized.length) return content;
  return `<span style="${sanitized.join("; ")};">${content}</span>`;
}

// ---------------------------------------------------------------------------
// [code] helpers
// ---------------------------------------------------------------------------

function bbCode(content: string): string {
  const trimmed = content.trim();
  if (content.includes("\n")) {
    return `<pre><code>${codeProtect(trimmed)}</code></pre>`;
  }
  return `<code class="inline-code">${codeProtect(trimmed)}</code>`;
}

function bbCodeOptions(options: string, content: string): string {
  const nowrap = options.includes("nowrap");
  const style = nowrap ? 'overflow-x: auto; white-space: pre;' : "";
  const multiline = content.includes("\n");
  const cls = multiline ? "" : "inline-code";

  const inner = codeProtect(content.trim());
  if (multiline) {
    return `<pre><code class="${cls}" style="${style}">${inner}</code></pre>`;
  }
  return `<code class="${cls}" style="${style}">${inner}</code>`;
}

// ---------------------------------------------------------------------------
// List helpers
// ---------------------------------------------------------------------------

function bbFixLf(content: string): string {
  return content.replace(/\]\s+\[/g, "][");
}

// ---------------------------------------------------------------------------
// Definition list
// ---------------------------------------------------------------------------

function bbDefinitionList(termStyles: string, content: string): string {
  const classes: string[] = ["bb-dl"];
  if (/b/i.test(termStyles)) classes.push("dl-terms-bold");
  if (/i/i.test(termStyles)) classes.push("dl-terms-italic");
  if (/u/i.test(termStyles)) classes.push("dl-terms-underline");
  if (/l/i.test(termStyles)) classes.push("dl-terms-large");
  if (/m/i.test(termStyles)) classes.push("dl-terms-monospace");
  if (/h/i.test(termStyles)) classes.push("dl-horizontal");
  if (classes.length === 1) classes.push("dl-terms-plain");

  let listElements = content.replace(/^[\n]/, "");
  listElements = listElements.replace(
    /(?:&nbsp;|[ \t])*\[\*=([^[]*?)(?<!\\)\]/gisu,
    "</dd>\n<dt>$1</dt><dd>"
  );
  // Unescape \] inside dt tags
  listElements = listElements.replace(/<dt>([\s\S]*?)<\/dt>/gi, (_m, inner) =>
    `<dt>${inner.replace(/\\]/g, "]")}</dt>`
  );

  // Remove leading </dd> if it comes before any <dd>
  const firstOpen = listElements.indexOf("<dd>");
  const firstClose = listElements.indexOf("</dd>");
  if (firstClose !== -1 && (firstOpen === -1 || firstClose < firstOpen)) {
    listElements = listElements.replace("</dd>", "");
  }

  return `<dl class="${classes.join(" ")}">${listElements}</dl>`;
}

// ---------------------------------------------------------------------------
// [open] / [spoiler] / [summary]
// ---------------------------------------------------------------------------

function bbOpenTag(title: string, body: string): string {
  const label = title || "Click to open/close";
  return `<details class="bb-open"><summary>${label}</summary><div>${body}</div></details>`;
}

function bbSpoilerTag(title: string, body: string): string {
  // Just the title — appending " spoiler" to it also fed the editor's
  // details→[spoiler=…] round-trip, so the word piled up on every edit.
  const label = title || "Spoiler";
  return `<details class="bb-spoiler"><summary>${label}</summary><blockquote>${body}</blockquote></details>`;
}

function bbSummary(pre: string, summary: string, full: string): string {
  return (
    pre +
    `<div class="bb-summary">${summary}</div>` +
    `<details class="bb-summary-full"><summary>View full article</summary>${full}</details>`
  );
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

function buildVideoTag(src: string, poster = "", maxWidth = 560): string {
  const posterAttr = poster ? `poster="${escapeHtml(poster)}" ` : "";
  const url = src.replace(/ /g, "%20");
  return `<video ${posterAttr}controls="controls" preload="none" src="${url}" style="width:100%; max-width:${maxWidth}px"><a href="${url}">${url}</a></video>`;
}

function buildAudioTag(src: string): string {
  const url = src.replace(/ /g, "%20");
  return `<audio src="${url}" controls="controls" preload="none"><a href="${url}">${url}</a></audio>`;
}

// ---------------------------------------------------------------------------
// [img] option parser
// ---------------------------------------------------------------------------

function bbImgOptions(
  tagName: string,        // "i" | "z"
  eqOrSpace: string,      // "=" or " "
  attributes: string,
  src: string
): string {
  // Core's bb_imgoptions only reads the '…' and &quot;…&quot; forms; the raw
  // "…" form is accepted here too so posts written by older builds of this
  // editor (which emitted alt="…") still render their alt text.
  const attr = (name: string): string => {
    let m = attributes.match(new RegExp(`${name}='(.*?)'`, "i"));
    if (m) return m[1];
    m = attributes.match(new RegExp(`${name}=&quot;(.*?)&quot;`, "i"));
    if (m) return m[1];
    m = attributes.match(new RegExp(`${name}="(.*?)"`, "i"));
    return m ? m[1] : "";
  };

  // [img=https://url]alt text[/img] — URL is in `attributes`, alt is in `src`
  if (eqOrSpace === "=" && /^https?:\/\//i.test(attributes.trim())) {
    const imgSrc = attributes.trim();
    const altText = src.trim();
    const zCls = tagName === "z" ? " zrl" : "";
    return `<img class="${zCls.trim()}" style="max-width: 100%;" src="${imgSrc}" alt="${escapeHtml(altText)}" title="${escapeHtml(altText)}" loading="lazy" />`;
  }

  let width = attr("width");
  let height = attr("height");
  let float_ = "";
  let alt = attr("alt");
  const title = attr("title");
  const cls = attr("class");

  // Legacy: [img=WxH float=left alt=text]
  if (eqOrSpace === "=") {
    const sizeM = attributes.match(/(\d*)x(\d*)/i);
    if (sizeM) width = sizeM[1];
  }
  if (attributes.includes("float=left")) float_ = "left";
  if (attributes.includes("float=right")) float_ = "right";
  // Legacy [img=WxH float=left alt=unquoted text] only — an unquoted match on
  // the modern form would swallow the surrounding quotes (and any attribute
  // that follows alt=) into the alt text.
  if (!alt && eqOrSpace === "=") {
    const altM = attributes.match(/alt=(.+)/i);
    if (altM) alt = altM[1];
  }

  let style = "";
  if (width) style += `width: ${parseInt(width)}px; `;
  if (height) style += `height: ${parseInt(height)}px; `;
  if (float_) style += `float: ${float_}; `;
  style += "max-width: 100%;";

  const zClass = tagName === "z" ? "zrl" : "";
  const altAttr = escapeHtml(alt || "Image/photo");
  const titleAttr = escapeHtml(title);
  const classAttr = escapeHtml(cls || zClass);

  return `<img style="${style}" alt="${altAttr}" title="${titleAttr}" class="${classAttr}" src="${src}" loading="lazy" />`;
}

// ---------------------------------------------------------------------------
// [observer] / [channel] tag processing
// ---------------------------------------------------------------------------

function bbObserver(text: string, observer: Observer | null | undefined, language = "en"): string {
  // language-specific observer tags
  text = text.replace(
    /\[observer\.language=(.*?)\]([\s\S]*?)\[\/observer\]/gi,
    (_m, lang, content) => {
      const compare = lang.length === 2 ? language.slice(0, 2) : language;
      return compare.toLowerCase() === lang.toLowerCase() ? content : "";
    }
  );
  text = text.replace(
    /\[observer\.language!=(.*?)\]([\s\S]*?)\[\/observer\]/gi,
    (_m, lang, content) => {
      const compare = lang.length === 2 ? language.slice(0, 2) : language;
      return compare.toLowerCase() !== lang.toLowerCase() ? content : "";
    }
  );

  if (observer) {
    text = text.replace(/\[observer=1\]([\s\S]*?)\[\/observer\]/gi, "$1");
    text = text.replace(/\[observer=0\][\s\S]*?\[\/observer\]/gi, "");
    text = text.replace(/\[rpost(?:=.*?)?\]([\s\S]*?)\[\/rpost\]/gi, "");
  } else {
    text = text.replace(/\[observer=1\][\s\S]*?\[\/observer\]/gi, "");
    text = text.replace(/\[observer=0\]([\s\S]*?)\[\/observer\]/gi, "$1");
    text = text.replace(/\[rpost(?:=.*?)?\][\s\S]*?\[\/rpost\]/gi, "");
  }

  return text;
}

function bbChannel(text: string, isOwner: boolean): string {
  if (isOwner) {
    text = text.replace(/\[channel=1\]([\s\S]*?)\[\/channel\]/gi, "$1");
    text = text.replace(/\[channel=0\][\s\S]*?\[\/channel\]/gi, "");
  } else {
    text = text.replace(/\[channel=1\][\s\S]*?\[\/channel\]/gi, "");
    text = text.replace(/\[channel=0\]([\s\S]*?)\[\/channel\]/gi, "$1");
  }
  return text;
}

function bbReplaceObserverVars(text: string, observer: Observer | null | undefined): string {
  if (observer) {
    const s1 = '<span class="bb_observer" title="Different viewers will see this text differently">';
    const s2 = "</span>";
    const baseUrl = (() => {
      try {
        const u = new URL(observer.xchan_url);
        return `${u.protocol}//${u.host}`;
      } catch {
        return "";
      }
    })();
    text = text.replace(/\[observer\.baseurl\]/g, baseUrl);
    text = text.replace(/\[observer\.url\]/g, observer.xchan_url);
    text = text.replace(/\[observer\.name\]/g, s1 + observer.xchan_name + s2);
    text = text.replace(/\[observer\.address\]/g, s1 + observer.xchan_addr + s2);
    const webname = observer.xchan_addr.split("@")[0] ?? "";
    text = text.replace(/\[observer\.webname\]/g, webname);
    text = text.replace(/\[observer\.photo\]/g, s1 + `[zmg]${observer.xchan_photo_l}[/zmg]` + s2);
  } else {
    text = text.replace(/\[observer\.(baseurl|url|name|address|webname|photo)\]/g, "");
  }
  return text;
}

// ---------------------------------------------------------------------------
// checklist
// ---------------------------------------------------------------------------

function bbChecklist(content: string): string {
  let s = content;
  s = s.replace(/\[\]/g, '<li><input type="checkbox" disabled>');
  s = s.replace(/\[x\]/gi, '<li><input type="checkbox" checked disabled>');
  return `<ul class="checklist" style="list-style-type: none;">${s}</ul>`;
}

// ---------------------------------------------------------------------------
// XSS filter: strip href/src attributes whose scheme is not whitelisted
// ---------------------------------------------------------------------------

function xssFilterLinks(html: string): string {
  return html.replace(
    /(<[^>]*?\b(?:src|href)\s*=\s*(['"])\s*)(?!https?:|geo:|mailto:|tel:|#|\/)[^'"]*?\2/giu,
    "$1$2$2"
  );
}

// ---------------------------------------------------------------------------
// Main bbcode() function
// ---------------------------------------------------------------------------

export function bbcode(text: string, options: BbcodeOptions = {}): string {
  if (!text) return "";

  const {
    tryOembed = true,
    cache = false,
    newWin = true,
    dropMedia = false,
    observer = null,
    isOwner = false,
    siteRoot = "",
    siteName = "",
    language = "en",
    oembedResolver,
    highlightResolver,
    mapResolver,
    zidResolver,
  } = options;

  const target = newWin ? 'target="_blank"' : "";
  const relAttr = 'rel="nofollow noopener"';

  // ------------------------------------------------------------------
  // Drop media if requested
  // ------------------------------------------------------------------
  if (dropMedia) {
    text = text.replace(/\[img[\s\S]*?\[\/img\]/gi, "");
    text = text.replace(/\[zmg[\s\S]*?\[\/zmg\]/gi, "");
    text = text.replace(/\[audio[\s\S]*?\[\/audio\]/gi, "");
    text = text.replace(/\[video[\s\S]*?\[\/video\]/gi, "");
    text = text.replace(/\[zaudio[\s\S]*?\[\/zaudio\]/gi, "");
    text = text.replace(/\[zvideo[\s\S]*?\[\/zvideo\]/gi, "");
  }

  // ------------------------------------------------------------------
  // [noparse] / [nobb] / [pre] — protect inner content
  // ------------------------------------------------------------------
  const applySpacefy = (tag: string, t: string) =>
    t.replace(
      new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "gi"),
      (_m, inner) => `[${tag}]${bbSpacefy(inner)}[/${tag}]`
    );

  text = applySpacefy("noparse", text);
  text = applySpacefy("nobb", text);
  text = applySpacefy("pre", text);
  text = applySpacefy("summary", text);

  // ------------------------------------------------------------------
  // [observer] / [channel] processing
  // ------------------------------------------------------------------
  text = bbObserver(text, cache ? null : observer, language);
  text = bbChannel(text, cache ? false : isOwner);

  // ------------------------------------------------------------------
  // Extract data: URIs from img tags
  // ------------------------------------------------------------------
  const { body: extractedBody, images: savedImages } = bbExtractImages(text);
  text = extractedBody;

  // ------------------------------------------------------------------
  // Site placeholders
  // ------------------------------------------------------------------
  text = text.replace(/\[baseurl\]/g, siteRoot);
  text = text.replace(/\[sitename\]/g, siteName);

  // ------------------------------------------------------------------
  // Escape HTML (prevent XSS from raw content)
  // ------------------------------------------------------------------
  text = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ------------------------------------------------------------------
  // Tab / double-space → nbsp
  // ------------------------------------------------------------------
  text = text.replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
  text = text.replace(/  /g, "&nbsp;&nbsp;");

  // ------------------------------------------------------------------
  // [code=lang] syntax-highlighted
  // ------------------------------------------------------------------
  text = text.replace(/\[code=([^\]]+?)\]([\s\S]*?)\[\/code\]/gi, (_m, lang, content) => {
    if (highlightResolver) {
      const highlighted = highlightResolver(lang.trim(), content);
      if (highlighted) return codeProtect(highlighted);
    }
    return `<pre><code class="language-${escapeHtml(lang.trim())}">${codeProtect(content.trim())}</code></pre>`;
  });

  // [code] plain
  text = text.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_m, content) => bbCode(content));

  // [code options]
  text = text.replace(/\[code ([^\]]+?)\]([\s\S]*?)\[\/code\]/gi, (_m, opts, content) =>
    bbCodeOptions(opts, content)
  );

  // ------------------------------------------------------------------
  // [pre] strip closing newline artifact
  // ------------------------------------------------------------------
  text = text.replace(/<\/pre>\r?\n/g, "</pre>");

  // ------------------------------------------------------------------
  // Observer variable placeholders (after escaping)
  // ------------------------------------------------------------------
  if (!cache) {
    text = bbReplaceObserverVars(text, observer);
  } else {
    text = text.replace(/\[observer\.(baseurl|url|name|address|webname|photo)\]/g, "");
  }

  // ------------------------------------------------------------------
  // URL auto-linking
  // ------------------------------------------------------------------
  const urlPattern = new RegExp(
    `([^\\]='";/]|^|#\\^)(https?:\\/\\/[a-zA-Z0-9:/?&;.=_~#%$!+,@()\\-]+)`,
    "giu"
  );

  if (tryOembed && oembedResolver) {
    text = text.replace(urlPattern, (m, pre, url) => {
      const embed = oembedResolver(url);
      return embed ? pre + embed : m;
    });
  }

  text = text.replace(urlPattern, (_m, pre, url) => {
    return `${pre}<a href="${url}" ${target} ${relAttr}>${url}</a>`;
  });

  // geo: URIs
  text = text.replace(
    /([^\]='";/]|^|#\^)(geo:([A-Za-z0-9:.,;_+\-?&=%]+)(?:\(([^)]+)\))?)/giu,
    (_m, pre, geoUri, _coords, label) => {
      const display = label ? "📍" + decodeURIComponent(label) : geoUri;
      return `${pre}<a href="${escapeHtml(geoUri)}" ${target} ${relAttr}>${escapeHtml(display)}</a>`;
    }
  );

  // ------------------------------------------------------------------
  // [event-summary]/[event-description]/[event-start]/[event-finish] — see
  // bbEventAttributes() above. Must run before [share] below so a reshared
  // event's tags are already converted by the time its body is captured.
  // ------------------------------------------------------------------
  text = text.replace(
    /\[event-summary\]([\s\S]*?)\[\/event-summary\](?:\[event-description\]([\s\S]*?)\[\/event-description\])?\[event-start\]([\s\S]*?)\[\/event-start\](?:\[event-finish\]([\s\S]*?)\[\/event-finish\])?(?:\[event-id\][\s\S]*?\[\/event-id\])?(?:\[event-adjust\][\s\S]*?\[\/event-adjust\])?/gi,
    (_m, summary, description, start, finish) =>
      bbEventAttributes(summary, description ?? "", start, finish ?? "")
  );

  // ------------------------------------------------------------------
  // Compact [share=<item id>][/share] — compose-time token (expanded to the
  // full attribute block server-side on save); only seen in editor previews
  // ------------------------------------------------------------------
  text = text.replace(
    /\[share=(\d+)\]([\s\S]*?)\[\/share\]/gi,
    (_m, id) => `<div class="bb-share bb-share-compact">🔁 Shared post #${id}</div>`
  );

  // ------------------------------------------------------------------
  // Compact [card=<item id>][/card] — compose-time token, expanded to a
  // [share] block server-side on save (see Concerns/EmbedsCards.php); only
  // seen in editor previews, same as the [share=<id>] fallback above.
  // ------------------------------------------------------------------
  text = text.replace(
    /\[card=(\d+)\]\s*\[\/card\]/gi,
    (_m, id) => `<div class="bb-card-compact">\u{1F5C2}\uFE0F Card embed #${id}</div>`,
  );

  // ------------------------------------------------------------------
  // [share] (nested, up to 10 levels)
  // ------------------------------------------------------------------
  let shareLoop = 0;
  while (text.includes("[/share]") && shareLoop < 10) {
    text = text.replace(
      // The content group must not swallow a nested [share — otherwise the
      // outer opener pairs with the *inner* closer, mis-nesting the cards and
      // leaving a literal [/share] behind. Innermost first, loop peels outward.
      /\[share([^\]]*)\]((?:(?!\[share)[\s\S])*?)\[\/share\]/gi,
      (_m, attrs, content) => bbShareAttributes(attrs, content, options)
    );
    shareLoop++;
  }

  // ------------------------------------------------------------------
  // [url] oembed
  // ------------------------------------------------------------------
  if (tryOembed && oembedResolver) {
    text = text.replace(/[^\^]\[url\]([^\[\]]*)\[\/url\]/gi, (_m, url) => {
      const embed = oembedResolver(url);
      return embed ?? `<a href="${url}" ${target} ${relAttr}>${url}</a>`;
    });
  }

  // #^ bookmarks
  text = text.replace(
    /\#\^\[url\]([^\[\]]*)\[\/url\]/gi,
    `<span class="bookmark-identifier">#^</span><a class="bookmark" href="$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\#\^\[url=([^\[\]]*)\](.*?)\[\/url\]/gi,
    `<span class="bookmark-identifier">#^</span><a class="bookmark" href="$1" ${target} ${relAttr}>$2</a>`
  );
  text = text.replace(
    /\[url\]([^\[\]]*)\[\/url\]/gi,
    `<a href="$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\[url=([^\[\]]*)\]([\s\S]*?)\[\/url\]/gi,
    `<a href="$1" ${target} ${relAttr}>$2</a>`
  );

  // [zrl] links
  text = text.replace(
    /\#\^\[zrl\]([^\[\]]*)\[\/zrl\]/gi,
    `<span class="bookmark-identifier">#^</span><a class="zrl bookmark" href="$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\#\^\[zrl=([^\[\]]*)\](.*?)\[\/zrl\]/gi,
    `<span class="bookmark-identifier">#^</span><a class="zrl bookmark" href="$1" ${target} ${relAttr}>$2</a>`
  );
  text = text.replace(
    /\[zrl\]([^\[\]]*)\[\/zrl\]/gi,
    `<a class="zrl" href="$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\[zrl=([^\[\]]*)\]([\s\S]*?)\[\/zrl\]/gi,
    `<a class="zrl" href="$1" ${target} ${relAttr}>$2</a>`
  );

  // [mail]
  text = text.replace(
    /\[mail\]([^\[\]]*)\[\/mail\]/gi,
    `<a href="mailto:$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\[mail=([^\[\]]*)\](.*?)\[\/mail\]/gi,
    `<a href="mailto:$1" ${target} ${relAttr}>$2</a>`
  );

  // ------------------------------------------------------------------
  // [map]
  // ------------------------------------------------------------------
  if (cache) {
    text = text.replace(/\[map\]|\[\/map\]/g, "");
    text = text.replace(/\[map=(.*?)\]/gi, "$1");
  } else {
    // No resolver: emit a plain anchor rather than an empty div. useOsmMap()
    // swaps these for embedded maps once the DOM exists (sanitizeHtml strips
    // iframes and data-*, so the map cannot be built here), and where the
    // feature is off the post still reads as a working link.
    text = text.replace(/\[map\](.*?)\[\/map\]/gi, (_m, loc) => {
      if (mapResolver) {
        const html = mapResolver(loc, "location");
        if (html) return `<div class="map">${html}</div>`;
      }
      return `<a class="map-embed" href="${escapeHtml(osmSearchLink(loc))}" ${target} ${relAttr}>${escapeHtml(loc)}</a>`;
    });
    text = text.replace(/\[map=(.*?)\]/gi, (_m, coords) => {
      const raw = coords.replace(/\//g, " ");
      if (mapResolver) {
        const html = mapResolver(raw, "coords");
        if (html) return `<div class="map">${html}</div>`;
      }
      const c = parseCoord(raw);
      if (!c) return escapeHtml(raw);
      return `<a class="map-embed" href="${escapeHtml(osmLink(c))}" ${target} ${relAttr}>${c.lat} ${c.lon}</a>`;
    });
    // Bare [map] = "a map of this item's own coordinates" — useOsmMap() fills
    // it from the post's coord field, since bbcode has no access to it here.
    text = text.replace(/\[map\]/gi, '<div class="map"></div>');
  }

  // ------------------------------------------------------------------
  // Inline formatting
  // ------------------------------------------------------------------

  text = text.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>");
  text = text.replace(/\[strong\]([\s\S]*?)\[\/strong\]/gi, "<strong>$1</strong>");
  text = text.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>");
  text = text.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
  text = text.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, "<del>$1</del>");
  text = text.replace(
    /\[o\]([\s\S]*?)\[\/o\]/gi,
    '<span style="text-decoration: overline;">$1</span>'
  );
  text = text.replace(/\[sup\]([\s\S]*?)\[\/sup\]/gi, "<sup>$1</sup>");
  text = text.replace(/\[sub\]([\s\S]*?)\[\/sub\]/gi, "<sub>$1</sub>");

  // [color]
  text = text.replace(
    /\[color=(.*?)\]([\s\S]*?)\[\/color\]/gi,
    '<span style="color: $1;">$2</span>'
  );

  // [hl] (deprecated highlight)
  text = text.replace(
    /\[hl\]([\s\S]*?)\[\/hl\]/gi,
    '<span class="default-highlight">$1</span>'
  );
  text = text.replace(
    /\[hl=(.*?)\]([\s\S]*?)\[\/hl\]/gi,
    '<span style="background-color: $1;">$2</span>'
  );

  // [mark]
  text = text.replace(
    /\[mark\]([\s\S]*?)\[\/mark\]/gi,
    '<mark class="mark">$1</mark>'
  );
  text = text.replace(
    /\[mark=(.*?)\]([\s\S]*?)\[\/mark\]/gi,
    '<mark style="background-color: $1;">$2</mark>'
  );

  // [size]
  text = text.replace(
    /\[size=(\d+?)\]([\s\S]*?)\[\/size\]/gi,
    '<span style="font-size: $1px;">$2</span>'
  );
  text = text.replace(
    /\[size=(.*?)\]([\s\S]*?)\[\/size\]/gi,
    '<span style="font-size: $1;">$2</span>'
  );

  // [h1]–[h6]
  for (let h = 1; h <= 6; h++) {
    text = text.replace(
      new RegExp(`\\[h${h}\\]([\\s\\S]*?)\\[\\/h${h}\\]`, "gi"),
      `<h${h}>$1</h${h}>`
    );
    text = text.replace(new RegExp(`<\\/h${h}>\\r?\\n`, "g"), `</h${h}>`);
  }

  // [toc]
  let tocLoop = 0;
  while (text.includes("[toc]") && tocLoop < 20) {
    const tocId = "toc-" + randomString(10);
    text = text.replace("[toc]", `<ul id="${tocId}" class="toc"></ul>`);
    tocLoop++;
  }
  text = text.replace(/\[toc([^\]]+?)\]/gi, (_m, attrs) => {
    const tocId = "toc-" + randomString(10);
    return `<ul id="${tocId}" class="toc" ${attrs}></ul>`;
  });

  // [center]
  text = text.replace(
    /\[center\]([\s\S]*?)\[\/center\]/gi,
    '<div style="text-align:center;">$1</div>'
  );

  // [footer]
  text = text.replace(
    /\[footer\]([\s\S]*?)\[\/footer\]/gi,
    '<div class="wall-item-footer">$1</div>'
  );

  // [bdi]
  text = text.replace(/\[bdi\]([\s\S]*?)\[\/bdi\]/gi, "<bdi>$1</bdi>");

  // ------------------------------------------------------------------
  // Lists
  // ------------------------------------------------------------------

  text = text.replace(/\r?\n\[\*\]/g, "[*]");
  text = text.replace(/\r\[\*\]/g, "[*]");
  text = text.replace(/\[\*\]/g, "<li>");

  let listLoop = 0;
  while (
    (text.includes("[/list]") ||
      text.includes("[/ol]") ||
      text.includes("[/ul]") ||
      text.includes("[/dl]") ||
      text.includes("[/li]")) &&
    listLoop < 20
  ) {
    text = text.replace(/\[\/list\]\r?\n/g, "[/list]");

    text = text.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_m, c) => `<ul class="listbullet">${bbFixLf(c)}</ul>`);
    text = text.replace(/\[list=\]([\s\S]*?)\[\/list\]/gi, (_m, c) => `<ul class="listnone" style="list-style-type: none;">${bbFixLf(c)}</ul>`);
    text = text.replace(/\[list=1\]([\s\S]*?)\[\/list\]/gi, (_m, c) => `<ol class="listdecimal" style="list-style-type: decimal;">${bbFixLf(c)}</ol>`);
    text = text.replace(/\[list=i\]([\s\S]*?)\[\/list\]/g, (_m, c) => `<ol class="listlowerroman" style="list-style-type: lower-roman;">${bbFixLf(c)}</ol>`);
    text = text.replace(/\[list=I\]([\s\S]*?)\[\/list\]/g, (_m, c) => `<ol class="listupperroman" style="list-style-type: upper-roman;">${bbFixLf(c)}</ol>`);
    text = text.replace(/\[list=a\]([\s\S]*?)\[\/list\]/g, (_m, c) => `<ol class="listloweralpha" style="list-style-type: lower-alpha;">${bbFixLf(c)}</ol>`);
    text = text.replace(/\[list=A\]([\s\S]*?)\[\/list\]/g, (_m, c) => `<ol class="listupperalpha" style="list-style-type: upper-alpha;">${bbFixLf(c)}</ol>`);
    text = text.replace(/\[ol\]([\s\S]*?)\[\/ol\]/gi, (_m, c) => `<ol class="listdecimal" style="list-style-type: decimal;">${bbFixLf(c)}</ol>`);
    text = text.replace(/\[ul\]([\s\S]*?)\[\/ul\]/gi, (_m, c) => `<ul class="listbullet">${bbFixLf(c)}</ul>`);
    text = text.replace(/\[\/li\]<br \/>\[li\]/gi, "[/li][li]");
    text = text.replace(/\[li\]([\s\S]*?)\[\/li\]/gi, "<li>$1</li>");

    // [dl]
    text = text.replace(
      /\[dl\s*(?:terms=(?:&quot;|")?([a-zA-Z]+)(?:&quot;|")?)?\]([\s\S]*?)\[\/dl\]/gi,
      (_m, styles, content) => bbDefinitionList(styles ?? "", content)
    );

    listLoop++;
  }

  // [checklist]
  text = text.replace(
    /\[checklist\]([\s\S]*?)\[\/checklist\]/gi,
    (_m, content) => bbChecklist(bbFixLf(content))
  );

  // ------------------------------------------------------------------
  // Tables
  // ------------------------------------------------------------------
  text = text.replace(/\[\/table\]\r?\n/g, "[/table]");
  text = text.replace(
    /\[table\]([\s\S]*?)\[\/table\]/gi,
    (_m, c) => `<table>${bbFixLf(c)}</table>`
  );
  text = text.replace(
    /\[table border=1\]([\s\S]*?)\[\/table\]/gi,
    (_m, c) => `<table class="table table-responsive table-bordered">${bbFixLf(c)}</table>`
  );
  text = text.replace(
    /\[table border=0\]([\s\S]*?)\[\/table\]/gi,
    (_m, c) => `<table class="table table-responsive">${bbFixLf(c)}</table>`
  );
  text = text.replace(/\[th\]([\s\S]*?)\[\/th\]/gi, "<th>$1</th>");
  text = text.replace(/\[td\]([\s\S]*?)\[\/td\]/gi, "<td>$1</td>");
  text = text.replace(/\[tr\]([\s\S]*?)\[\/tr\]/gi, "<tr>$1</tr>");

  // [hr]
  text = text.replace(/\[hr\]/g, "<hr />");

  // [nosmile]
  text = text.replace(/\[nosmile\]/g, "");

  // [font]
  text = text.replace(
    /\[font=(.*?)\]([\s\S]*?)\[\/font\]/gi,
    '<span style="font-family: $1;">$2</span>'
  );

  // ------------------------------------------------------------------
  // [spoiler] (nested, up to 20)
  // ------------------------------------------------------------------
  let spoilerLoop = 0;
  while ((text.includes("[/spoiler]") && text.includes("[spoiler]")) && spoilerLoop < 20) {
    text = text.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_m, body) => bbSpoilerTag("", body));
    spoilerLoop++;
  }
  spoilerLoop = 0;
  while ((text.includes("[/spoiler]") && text.includes("[spoiler=")) && spoilerLoop < 20) {
    text = text.replace(/\[spoiler=(.*?)\]([\s\S]*?)\[\/spoiler\]/gi, (_m, title, body) => bbSpoilerTag(title, body));
    spoilerLoop++;
  }

  // ------------------------------------------------------------------
  // [open] (nested, up to 20)
  // ------------------------------------------------------------------
  let openLoop = 0;
  while ((text.includes("[/open]") && text.includes("[open]")) && openLoop < 20) {
    text = text.replace(/\[open\]([\s\S]*?)\[\/open\]/gi, (_m, body) => bbOpenTag("", body));
    openLoop++;
  }
  openLoop = 0;
  while ((text.includes("[/open]") && text.includes("[open=")) && openLoop < 20) {
    text = text.replace(/\[open=(.*?)\]([\s\S]*?)\[\/open\]/gi, (_m, title, body) => bbOpenTag(title, body));
    openLoop++;
  }

  // ------------------------------------------------------------------
  // [quote]
  // ------------------------------------------------------------------
  let quoteLoop = 0;
  while (text.includes("[/quote]") && text.includes("[quote]") && quoteLoop < 20) {
    text = text.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, "<blockquote>$1</blockquote>");
    quoteLoop++;
  }
  quoteLoop = 0;
  while (text.includes("[/quote]") && text.includes("[quote=") && quoteLoop < 20) {
    text = text.replace(
      /\[quote=["']*(.*?)["']*\]([\s\S]*?)\[\/quote\]/gi,
      '<span class="bb-quote">$1 wrote:</span><blockquote>$2</blockquote>'
    );
    quoteLoop++;
  }

  // ------------------------------------------------------------------
  // Images
  // ------------------------------------------------------------------

  // plain [img]url[/img]
  text = text.replace(
    /\[img\](.*?)\[\/img\]/gi,
    `<img style="max-width: 100%;" src="$1" alt="Image/photo" loading="lazy" />`
  );
  // [img=url]alt[/img]
  text = text.replace(
    /\[img=http(.*?)\](.*?)\[\/img\]/gi,
    `<img style="max-width: 100%;" src="http$1" alt="$2" title="$2" loading="lazy" />`
  );
  // [zmg]url[/zmg]
  text = text.replace(
    /\[zmg\](.*?)\[\/zmg\]/gi,
    `<img class="zrl" style="max-width: 100%;" src="$1" alt="Image/photo" loading="lazy" />`
  );
  // [zmg=url]alt[/zmg]
  text = text.replace(
    /\[zmg=http(.*?)\](.*?)\[\/zmg\]/gi,
    `<img class="zrl" style="max-width: 100%;" src="http$1" alt="$2" title="$2" loading="lazy" />`
  );

  // [img options] / [zmg options]
  text = text.replace(
    /\[([zi])mg([ =])(.*?)\](.*?)\[\/[zi]mg\]/gi,
    (_m, tagName, eqOrSpace, attrs, src) => bbImgOptions(tagName, eqOrSpace, attrs, src)
  );

  // ------------------------------------------------------------------
  // [style]
  // ------------------------------------------------------------------
  text = text.replace(
    /\[style=(.*?)\]([\s\S]*?)\[\/style\]/gi,
    (_m, css, content) => bbSanitizeStyle(css, content)
  );

  // ------------------------------------------------------------------
  // [crypt] — render a decrypt button; PostCard/PageView/HtmlBlockWidget wire
  // up the click handler via event delegation using the data-crypt-payload
  // attribute (see decrypt-click.ts). contenteditable="false" keeps the
  // WYSIWYG editor from letting the placeholder text be typed into — and
  // htmlToSource.ts reads data-crypt-payload back into [crypt]...[/crypt]
  // verbatim regardless, the same round-trip contract as the [share] embed.
  // ------------------------------------------------------------------
  function makeCryptHtml(payload: string): string {
    // Escape payload for HTML attribute (base64 is safe but guard against edge cases)
    const safe = payload.replace(/"/g, "&quot;");
    return `<button class="hz-decrypt-btn" data-crypt-payload="${safe}" type="button" contenteditable="false">🔒 Encrypted content</button>`;
  }
  text = text.replace(/\[crypt\]([\s\S]*?)\[\/crypt\]/gi, (_m, payload) =>
    makeCryptHtml((payload as string).trim()),
  );
  text = text.replace(/\[crypt (.*?)\]([\s\S]*?)\[\/crypt\]/gi, (_m, _attrs, payload) =>
    makeCryptHtml((payload as string).trim()),
  );

  // ------------------------------------------------------------------
  // [app] / [element] — strip tags, emit placeholder
  // ------------------------------------------------------------------
  text = text.replace(/\[app\]([\s\S]*?)\[\/app\]/gi, "");
  text = text.replace(/\[element\]([\s\S]*?)\[\/element\]/gi, "");

  // ------------------------------------------------------------------
  // Media: [video], [audio], [zvideo], [zaudio]
  // ------------------------------------------------------------------

  // [video]/[zvideo] tags are meant for direct media file URLs, but users
  // (and the editor's own toolbar "Video" button) commonly paste a YouTube
  // or Vimeo page URL in there instead of a raw file. A <video src="...">
  // pointed at a YouTube watch page can never play, so try the oembed
  // resolver first and only fall back to a native <video> tag when the URL
  // isn't a recognised provider link.
  const videoOrEmbed = (src: string, poster = "", maxWidth = 560): string => {
    if (tryOembed && oembedResolver) {
      const embed = oembedResolver(src.trim());
      if (embed) return embed;
    }
    return buildVideoTag(src, poster, maxWidth);
  };

  // [video opts]url[/video]
  text = text.replace(/\[video (.*?)\](.*?)\[\/video\]/gi, (_m, opts, src) => {
    const posterM = opts.match(/poster='(.*?)'/i) ?? opts.match(/poster=&quot;(.*?)&quot;/i);
    return videoOrEmbed(src, posterM?.[1] ?? "");
  });
  text = text.replace(/\[video\](.*?)\[\/video\]/gi, (_m, src) => videoOrEmbed(src));

  text = text.replace(/\[audio\](.*?)\[\/audio\]/gi, (_m, src) => buildAudioTag(src));

  text = text.replace(/\[zvideo (.*?)\](.*?)\[\/zvideo\]/gi, (_m, opts, src) => {
    const posterM = opts.match(/poster='(.*?)'/i);
    const resolvedSrc = zidResolver ? zidResolver(src) : src;
    return videoOrEmbed(resolvedSrc, posterM?.[1] ?? "");
  });
  text = text.replace(/\[zvideo\](.*?)\[\/zvideo\]/gi, (_m, src) => {
    return videoOrEmbed(zidResolver ? zidResolver(src) : src);
  });
  text = text.replace(/\[zaudio\](.*?)\[\/zaudio\]/gi, (_m, src) => {
    return buildAudioTag(zidResolver ? zidResolver(src) : src);
  });

  // Fallback: any remaining media tags → plain link
  text = text.replace(
    /\[video\](.*?)\[\/video\]/gi,
    `<a href="$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\[audio\](.*?)\[\/audio\]/gi,
    `<a href="$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\[zvideo\](.*?)\[\/zvideo\]/gi,
    `<a class="zid" href="$1" ${target} ${relAttr}>$1</a>`
  );
  text = text.replace(
    /\[zaudio\](.*?)\[\/zaudio\]/gi,
    `<a class="zid" href="$1" ${target} ${relAttr}>$1</a>`
  );

  // ------------------------------------------------------------------
  // [embed] (oembed tag)
  // ------------------------------------------------------------------
  text = text.replace(/\[\/embed\]\r?\n/g, "[/embed]");
  if (oembedResolver) {
    text = text.replace(/\[embed\](.*?)\[\/embed\]/gi, (_m, url) => {
      return oembedResolver(url) ?? `<a href="${url}" ${target} ${relAttr}>${url}</a>`;
    });
  } else {
    text = text.replace(/\[embed\](.*?)\[\/embed\]/gi, `<a href="$1" ${target} ${relAttr}>$1</a>`);
  }

  // ------------------------------------------------------------------
  // [summary] restore + render
  // ------------------------------------------------------------------
  text = text.replace(
    /\[summary\]([\s\S]*?)\[\/summary\]/gi,
    (_m, inner) => `[summary]${bbUnspacefy(inner)}[/summary]`
  );
  text = text.replace(
    /^([\s\S]*?)\[summary\]([\s\S]*?)\[\/summary\]([\s\S]*)$/i,
    (_m, pre, summary, full) => bbSummary(pre, summary, full)
  );

  // ------------------------------------------------------------------
  // Restore [noparse] / [nobb] / [pre]
  // ------------------------------------------------------------------
  const applyUnspacefy = (tag: string, t: string) =>
    t.replace(
      new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "gi"),
      (_m, inner) => bbUnspacefyAndTrim(inner)
    );

  text = applyUnspacefy("noparse", text);
  text = applyUnspacefy("nobb", text);
  text = applyUnspacefy("pre", text);

  // ------------------------------------------------------------------
  // Unescape entity references inside BBCode (e.g. [&amp;nbsp;] → &nbsp;)
  // ------------------------------------------------------------------
  text = text.replace(/\[&amp;([#a-z0-9]+);\]/gi, "&$1;");

  // Fix escaped ampersands in link attributes
  text = text.replace(/<(.*?)(?:src|href)=(.*?)&amp;(.*?)>/gi, (m) =>
    m.replace(/&amp;/g, "&")
  );

  // ------------------------------------------------------------------
  // XSS: reject non-whitelisted schemes in href/src
  // ------------------------------------------------------------------
  text = xssFilterLinks(text);

  // ------------------------------------------------------------------
  // Restore extracted images
  // ------------------------------------------------------------------
  text = bbReplaceImages(text, savedImages);

  // ------------------------------------------------------------------
  // Convert newlines to <br />
  // ------------------------------------------------------------------
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[\r\n]/g, "<br />");

  // ------------------------------------------------------------------
  // Restore protected code blocks (after <br /> conversion so that
  // newlines inside <pre><code> are preserved, not converted to <br>)
  // ------------------------------------------------------------------
  text = text.replace(/%eY9-!/g, "http");
  text = codeUnprotect(text);

  return text;
}

// ---------------------------------------------------------------------------
// Named re-export for convenience
// ---------------------------------------------------------------------------
export { bbcode as bbcodeToHtml };
export default bbcode;
