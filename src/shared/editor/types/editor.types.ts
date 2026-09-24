import type { MimeType } from "@utsukta/spa-core/lib/mimetypes";

export type EditorTab = "wysiwyg" | "source";
// Single source of truth lives in spa-core/lib/mimetypes.ts; re-exported here
// so the existing `import type { MimeType } from ".../editor.types"` sites keep
// working.
export type { MimeType };

// "full": everything. "quick": inline marks + link + emoji, one row — for
// compact bars that sit in a page rather than a modal. "comment": inline
// marks only. "none": no toolbar row at all — for bars that spell their
// actions out themselves (the HQ quick post composer). ("minimal" used to sit
// between full and comment and was never used by any composer; "quick"
// replaced it.)
export type ToolbarLevel = "full" | "quick" | "comment" | "none";
export type AttachmentsMode = "none" | "files" | "photos" | "both";
// How the LaTeX toolbar button inserts an equation:
// - "image": render to PNG, upload as a photo, insert a hosted [img] URL —
//   for federated content, where a raw data: URI/inline SVG is unreliable.
// - "live": insert $…$ / $$…$$ text, rendered client-side by hydrateLatex()
//   wherever the content is actually viewed — for in-app-only content.
export type LatexInsertMode = "image" | "live";

export type EditorCapabilities = {
  toolbar: ToolbarLevel;
  title: boolean;
  summary: boolean;
  slug: boolean;
  category: boolean;
  attachments: AttachmentsMode;
  aclPicker: boolean;
  submitOnCtrlEnter: boolean;
  latexMode: LatexInsertMode;
  poll: boolean;
  // Whether the toolbar offers "Insert card" — true wherever a [card=<id>]
  // token is meaningful, i.e. content whose body Item.php/Cards.php expand at
  // save time. Off elsewhere so the button can't insert a token that would be
  // stored raw.
  cardPicker: boolean;
  // Whether the composer offers a content-format picker (item.mimetype).
  // Core only offers one on webpages and blocks (Editwebpage.php:154,
  // Editblock.php:123), and so do we. Posts and comments federate, where
  // only bbcode survives (Activity.php:717, Lib/Share.php:35), so instead of
  // a per-post choice they follow the "Markdown" feature toggle (the mdpost
  // addon's, which the SPA reuses rather than adding its own) and
  // the server converts markdown to bbcode on save.
  format: boolean;
  // Whether the WYSIWYG surface may be used for a text/markdown body.
  //
  // Free for posts, comments and DMs, whose body is converted to bbcode on
  // save, so the round trip's normalisation never reaches stored content.
  // Everywhere else the body *is* the stored content, so the composer pairs
  // this with createWysiwygAvailable() (wysiwygSafe.ts), which offers the tab
  // only for a body that survives the trip byte-for-byte.
  //
  // Off for wiki pages whatever the body says: core git-versions them, and a
  // normalising edit would read as a whole-file rewrite in the page history.
  // See markdownProtect.ts and canUseWysiwyg().
  nonBbcodeWysiwyg: boolean;
  // Whether this body is converted to bbcode when it is saved — i.e. whether
  // bbcode mixed into a non-bbcode source still works.
  //
  // True for posts, comments and DMs (the mdpost addon converts a text/markdown
  // body on save), so the toolbar may spell underline, colour, font, size and
  // spoiler as bbcode inside Markdown, which is what it has always done.
  // False wherever the body is stored as typed — articles, cards, webpages,
  // blocks, wiki pages, notes — because core renders those with MarkdownExtra
  // alone and a [b] would show up literally. See core/markup.ts.
  bbcodeFallback: boolean;
};

export type ComposerMeta = {
  title?: string;
  summary?: string;
  slug?: string;
  category?: string;
  mimetype?: MimeType;
};

export const CAPABILITIES: Record<string, EditorCapabilities> = {
  // Wall post (HQ / network composer)
  post: {
    toolbar: "full",
    title: true,
    summary: true,
    slug: false,
    category: true,
    attachments: "both",
    aclPicker: true,
    submitOnCtrlEnter: true,
    latexMode: "image",
    poll: true,
    cardPicker: true,
    format: false,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: true,
  },
  // Inline comment box under a PostCard — same full toolbar as the post
  // composer, only the meta fields (title/summary/ACL/…) are stripped.
  comment: {
    toolbar: "full",
    title: false,
    summary: false,
    slug: false,
    category: false,
    attachments: "none",
    aclPicker: false,
    submitOnCtrlEnter: true,
    latexMode: "image",
    poll: false,
    cardPicker: true,
    format: false,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: true,
  },
  // Direct message — same full toolbar as post, but recipients are picked
  // via a "To:" field (RecipientField) instead of the ACL picker, so
  // aclPicker stays false here even though it does gate visibility/scope.
  dm: {
    toolbar: "full",
    title: false,
    summary: false,
    slug: false,
    category: false,
    attachments: "both",
    aclPicker: false,
    submitOnCtrlEnter: true,
    latexMode: "image",
    poll: false,
    cardPicker: false,
    format: false,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: true,
  },
  // Article / long-form post — read in-app like webpages/wiki, not federated
  // as a standalone object in the same way a stream post is, so LaTeX
  // renders live (KaTeX) rather than as an uploaded image.
  article: {
    toolbar: "full",
    title: true,
    summary: true,
    slug: true,
    category: true,
    attachments: "both",
    aclPicker: true,
    submitOnCtrlEnter: false,
    latexMode: "live",
    poll: false,
    cardPicker: true,
    format: true,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: false,
  },
  // Card — short-form, item-backed content read in-app like articles, so
  // LaTeX renders live (KaTeX). A card body may itself embed another card:
  // Cards.php expands the token at save time exactly as Item.php does.
  card: {
    toolbar: "full",
    title: true,
    summary: true,
    slug: true,
    category: true,
    attachments: "both",
    aclPicker: true,
    submitOnCtrlEnter: false,
    latexMode: "live",
    poll: false,
    cardPicker: true,
    format: true,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: false,
  },
  // Hubzilla webpage (static page with slug) — read in-app, not federated as
  // a standalone object, so LaTeX renders live (KaTeX) rather than as an image.
  webpage: {
    toolbar: "full",
    title: true,
    summary: true,
    slug: true,
    category: false,
    attachments: "files",
    aclPicker: true,
    submitOnCtrlEnter: false,
    latexMode: "live",
    poll: false,
    cardPicker: false,
    format: true,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: false,
  },
  // Hubzilla block (item-backed content preset, referenced by name rather
  // than URL slug — see core's Comanche [block]name[/block]) — read in-app
  // like webpages, so LaTeX renders live (KaTeX) rather than as an image.
  block: {
    toolbar: "full",
    title: true,
    summary: false,
    slug: true,
    category: false,
    attachments: "files",
    aclPicker: true,
    submitOnCtrlEnter: false,
    latexMode: "live",
    poll: false,
    cardPicker: false,
    format: true,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: false,
  },
  // Wiki page — full toolbar (uniform with the other composers), no ACL;
  // live LaTeX, same reasoning as webpage above. Attachments upload to the
  // channel's cloud files and are inserted into the page body as markup, the
  // same as every other composer — a wiki page is plain stored text, so there
  // is no item `attach` array for them to live in.
  wiki: {
    toolbar: "full",
    title: false,
    summary: false,
    slug: false,
    category: false,
    attachments: "both",
    aclPicker: false,
    submitOnCtrlEnter: false,
    latexMode: "live",
    poll: false,
    cardPicker: false,
    format: true,
    nonBbcodeWysiwyg: false,
    bbcodeFallback: false,
  },
  // Personal note — always private, full toolbar (uniform with the other
  // composers); read in-app only, so LaTeX renders live (KaTeX) rather than
  // as an uploaded image.
  note: {
    toolbar: "full",
    title: false,
    summary: false,
    slug: false,
    category: true,
    attachments: "both",
    aclPicker: false,
    submitOnCtrlEnter: true,
    latexMode: "live",
    poll: false,
    cardPicker: false,
    format: false,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: false,
  },
  // HQ quick-post bar — a wall post, so same pipeline as `post`, but with no
  // toolbar at all: the bar renders its own action row beneath the surface.
  quick: {
    toolbar: "none",
    title: false,
    summary: false,
    slug: false,
    category: false,
    attachments: "both",
    aclPicker: true,
    submitOnCtrlEnter: true,
    latexMode: "image",
    poll: false,
    cardPicker: true,
    format: false,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: true,
  },
  // Chat room message input — comment toolbar, untabbed, Ctrl+Enter sends
  // Chat message — the post composer's full toolbar. Stored as bbcode like a
  // post (Chat.php converts a Markdown body on send), hence nonBbcodeWysiwyg.
  // No [card] tokens: nothing expands them in chat_text.
  chat: {
    toolbar: "full",
    title: false,
    summary: false,
    slug: false,
    category: false,
    attachments: "both",
    aclPicker: false,
    submitOnCtrlEnter: true,
    latexMode: "image",
    poll: false,
    cardPicker: false,
    format: false,
    nonBbcodeWysiwyg: true,
    bbcodeFallback: true,
  },
};
