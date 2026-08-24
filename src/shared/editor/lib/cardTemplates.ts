/**
 * Card authoring templates.
 *
 * A template is a shaping convenience, not a storage format: each one
 * assembles a body out of bbcode core Hubzilla already renders, so a template
 * card stays readable in core's own /cards view and in federated copies. The
 * choice is persisted separately (iconfig cat 'card', k 'template') purely so
 * re-editing reopens the tab that produced the body.
 *
 * composeTemplate and parseTemplate must round-trip: reopening a stored card
 * for editing runs parse, and saving runs compose again, so any asymmetry
 * silently rewrites the user's body.
 */

export type CardTemplate = "freeform" | "quote" | "definition" | "link";

export const CARD_TEMPLATES: CardTemplate[] = ["freeform", "quote", "definition", "link"];

export interface TemplateFields {
  quoteText: string;
  quoteAttribution: string;
  defTerm: string;
  defBody: string;
  linkUrl: string;
  /** Fallback link label only. The composer has no input for it — the card's
   *  own Title is the label — but parseTemplate still fills it from a stored
   *  body so an older card whose label diverged from its title survives a
   *  round-trip. */
  linkTitle: string;
  linkNote: string;
  /** og:image from /spa/link-meta. Only emitted when includeImage is set. */
  linkImage: string;
}

export const emptyTemplateFields = (): TemplateFields => ({
  quoteText: "", quoteAttribution: "",
  defTerm: "", defBody: "",
  linkUrl: "", linkTitle: "", linkNote: "", linkImage: "",
});

export interface ComposeOptions {
  /** The card's Title field — the link template uses it as the [url] label. */
  title?: string;
  /** Prepend [url=…][img]linkImage[/img][/url] to a link body. */
  includeImage?: boolean;
}

/** Assemble a body from a template's parts. "" means "not complete yet". */
export function composeTemplate(
  template: CardTemplate,
  f: TemplateFields,
  opts: ComposeOptions = {},
): string {
  switch (template) {
    case "quote": {
      const text = f.quoteText.trim();
      if (!text) return "";
      const who = f.quoteAttribution.trim();
      return who ? `[quote=${who}]${text}[/quote]` : `[quote]${text}[/quote]`;
    }
    case "definition": {
      const term = f.defTerm.trim();
      const body = f.defBody.trim();
      if (!term || !body) return "";
      return `[b]${term}[/b]\n${body}`;
    }
    case "link": {
      const url = f.linkUrl.trim();
      if (!url) return "";
      const label = opts.title?.trim() || f.linkTitle.trim() || url;
      const note = f.linkNote.trim();
      const img = opts.includeImage && f.linkImage.trim()
        ? `[url=${url}][img]${f.linkImage.trim()}[/img][/url]\n`
        : "";
      return `${img}[url=${url}]${label}[/url]${note ? `\n${note}` : ""}`;
    }
    default:
      return "";
  }
}

/** Best-effort guess at which tab produced a stored body. */
export function sniffTemplate(body: string): CardTemplate | null {
  const b = body.trimStart();
  if (/^\[quote[=\]]/i.test(b)) return "quote";
  if (/^\[url=/i.test(b)) return "link";
  if (/^\[b\][^[]*\[\/b\]/i.test(b)) return "definition";
  return null;
}

/** The optional leading [url=…][img]…[/img][/url] thumbnail of a link body. */
const LINK_IMAGE_RE = /^\s*\[url=.*?\]\[img\](.*?)\[\/img\]\[\/url\]\s*/i;

/** Unpack a stored body back into template sub-form fields. */
export function parseTemplate(body: string): Partial<TemplateFields> {
  const q = body.match(/^\s*\[quote(?:=["']?(.*?)["']?)?\]([\s\S]*?)\[\/quote\]\s*$/i);
  if (q) return { quoteAttribution: q[1]?.trim() ?? "", quoteText: q[2].trim() };

  // Strip the thumbnail first so the label match below doesn't bind to it.
  const img = body.match(LINK_IMAGE_RE);
  const rest = img ? body.slice(img[0].length) : body;
  const l = rest.match(/^\s*\[url=(.*?)\]([\s\S]*?)\[\/url\]([\s\S]*)$/i);
  if (l) {
    return {
      linkUrl: l[1].trim(),
      linkTitle: l[2].trim(),
      linkNote: l[3].trim(),
      linkImage: img ? img[1].trim() : "",
    };
  }

  const d = body.match(/^\s*\[b\]([\s\S]*?)\[\/b\]([\s\S]*)$/i);
  if (d) return { defTerm: d[1].trim(), defBody: d[2].trim() };

  return {};
}
