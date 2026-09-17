/**
 * markdownTurndown.ts
 *
 * The HTML → Markdown serializer used by the WYSIWYG surface, configured so a
 * round trip is stable. RichEditor re-serializes the whole document on every
 * keystroke, so anything turndown rewrites is rewritten continuously — the bar
 * is not "reads nicely" but "converges after one pass and loses nothing".
 *
 * Measured over the corpus in markdown-roundtrip.test.ts: 24/26 constructs are
 * byte-identical and 26/26 are idempotent. The two that normalise (setext
 * headings become "#", reference links become inline) are meaning-preserving
 * and stable, and are asserted in the test so a turndown bump that changes them
 * is caught.
 *
 * Deliberately free of app imports so the round trip stays testable in bare
 * node — turndown ships its own DOM (domino) for that.
 */

import TurndownService from "turndown";

export const markdownTurndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  emDelimiter: "*",
  codeBlockStyle: "fenced",
  // Without this turndown emits "* * *" and a plain "---" rule never settles.
  hr: "---",
  // A <br> is a plain newline, not markdown's two-trailing-spaces hard break:
  // sourceToHtml parses with breaks:true, so "\n" already means a break, and
  // the invisible spaces only accumulated in the source.
  br: "",
});

/**
 * One Enter is one line, not a blank line.
 *
 * Contenteditable puts each typed line in its own <div>, and turndown's block
 * separator would put a blank line between them — correct for markdown in the
 * abstract (a paragraph ends at a blank line) but wrong here: the body is
 * converted to bbcode on save with preserve_lf, so a single "\n" is a real
 * line break, and sourceToHtml parses it back with breaks:true. Pressing Enter
 * once has to give one line, the same as it does in bbcode mode.
 *
 * <p> is left alone deliberately: marked emits a paragraph only where the
 * author *did* leave a blank line, so keeping its "\n\n" is what makes a typed
 * blank line survive the round trip. The two element names are the only thing
 * separating the two cases.
 */
markdownTurndown.addRule("typedLine", {
  filter: "div",
  replacement: (content) => `\n${content}\n`,
});

/**
 * Turndown escapes markdown metacharacters in text ("**bold**" typed into the
 * surface becomes "\*\*bold\*\*"), on the assumption that HTML is the source
 * of truth and typed punctuation is literal. That assumption is wrong here:
 * the surface *is* a markdown editor, so typing **bold** must become bold on
 * blur — the same way typing [b]bold[/b] already does in bbcode mode.
 *
 * The trade is the mirror of bbcode mode's: a literal asterisk or leading #
 * can be reinterpreted as formatting on the next pass. Markdown mode is
 * opt-in, and that is what choosing it asks for.
 */
markdownTurndown.escape = (text: string) => text;

/**
 * Restores a protected bbcode block verbatim.
 *
 * This is the rule the whole feature rests on: a rule's return value is
 * inserted as-is, bypassing the text escaping that would otherwise turn
 * "[b]bold[/b]" into "\[b\]bold\[/b\]" and destroy [img]/[zrl]/[attachment].
 * See markdownProtect.ts.
 */
markdownTurndown.addRule("bbraw", {
  filter: (node) =>
    node.nodeType === 1 && typeof node.hasAttribute === "function" && node.hasAttribute("data-bb-raw"),
  replacement: (_content, node) =>
    decodeURIComponent((node as HTMLElement).getAttribute("data-bb-raw") ?? ""),
});

/**
 * Turndown's stock listItem indents continuation by three spaces, so "- one"
 * comes back as "-   one" and every unedited list churns. Emit the
 * conventional single space instead.
 */
markdownTurndown.addRule("listItem", {
  filter: "li",
  replacement: (content, node, options) => {
    const body = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "\n")
      .replace(/\n/gm, "\n  ");

    // GFM task item: marked renders the checkbox as an <input>, which turndown
    // drops entirely, so the "[ ]"/"[x]" has to be put back from its state.
    const box = (node as HTMLElement).querySelector?.('input[type="checkbox"]');
    const task = box ? (box.hasAttribute("checked") ? "[x] " : "[ ] ") : "";
    // marked leaves a space between the <input> and the label text; without
    // trimming it the marker comes back as "- [ ]  todo".
    const text = task ? body.replace(/^\s+/, "") : body;

    let prefix = options.bulletListMarker + " " + task;
    const parent = node.parentNode as HTMLElement | null;
    if (parent && parent.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = (start ? Number(start) + index : index + 1) + ". ";
    }

    return prefix + text + (node.nextSibling && !/\n$/.test(text) ? "\n" : "");
  },
});

/**
 * Strikethrough. marked parses ~~x~~ into <del>, but turndown ships no rule
 * for it, so the markup was dropped on the first round trip — type ~~x~~,
 * press Enter, and the tildes were gone.
 */
markdownTurndown.addRule("strikethrough", {
  filter: ["del", "s"],
  replacement: (content) => (content.trim() ? `~~${content}~~` : ""),
});

/**
 * The extended-syntax marks from markedExtended.ts, back to the spelling they
 * were typed in. Without a rule turndown drops the element and the mark is
 * gone on the first re-serialize, the same way ~~ used to be.
 *
 * <mark> deliberately isn't here: the highlight button emits one carrying a
 * colour, which has no markdown spelling, so it goes through bbStyle below and
 * comes back as [mark=…] — and a plain one follows it for consistency.
 */
markdownTurndown.addRule("subscript", {
  filter: "sub",
  replacement: (content) => (content.trim() ? `~${content}~` : ""),
});

markdownTurndown.addRule("superscript", {
  filter: "sup",
  replacement: (content) => (content.trim() ? `^${content}^` : ""),
});

/**
 * Everything markdown cannot spell, as bbcode.
 *
 * Underline, colour, highlight, font, size, spoiler, centre, media, lettered
 * lists and sized images have no markdown syntax, and turndown dropped every
 * one of them silently — a toolbar button appeared to do nothing the moment the
 * surface re-serialized. They come back as *bbcode*, not raw HTML: a markdown
 * body already carries bbcode (the attachment bar, the card picker and the
 * source tab all emit it), markdownProtect round-trips every tag in BB_TAGS
 * byte-for-byte, and the server converts the whole body to bbcode on save
 * anyway. Raw HTML would additionally have to survive marked, DOMPurify and
 * the federation path.
 *
 * The conversions themselves live in elementBBCode.ts, shared with
 * htmlToSource's bbcode path — they were two hand-written mirrors and drifted.
 */
import {
  getStyle, styleBBCode, imgBBCode, mediaBBCode, listMarker, spoilerOpen,
  quoteAuthor, isQuoteLabel,
} from "./elementBBCode";

markdownTurndown.addRule("bbStyle", {
  filter: (node) => styleBBCode(node as unknown as Element, "") !== null,
  replacement: (content, node) => styleBBCode(node as unknown as Element, content) ?? content,
});

markdownTurndown.addRule("bbUnderline", {
  filter: "u",
  replacement: (content) => (content.trim() ? `[u]${content}[/u]` : ""),
});

/**
 * Images that carry more than "![alt](src)" can: an emoji chip (which is its
 * own shortname), a [zmg] photo, a resized image, a LaTeX equation. A plain
 * image stays plain markdown.
 */
markdownTurndown.addRule("bbImage", {
  filter: (node) => {
    if (node.nodeName !== "IMG") return false;
    const el = node as unknown as Element;
    return (
      el.classList.contains("emoji") ||
      el.classList.contains("zrl") ||
      el.classList.contains("bb-latex-img") ||
      !!getStyle(el, "width") ||
      !!el.getAttribute("width")
    );
  },
  replacement: (_content, node) => imgBBCode(node as unknown as Element),
});

markdownTurndown.addRule("bbMedia", {
  filter: ["video", "audio"],
  replacement: (_content, node) =>
    (node as HTMLElement).getAttribute("src") ? `\n\n${mediaBBCode(node as unknown as Element)}\n\n` : "",
});

markdownTurndown.addRule("bbSpoiler", {
  filter: "details",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const open = spoilerOpen(el as unknown as Element);
    const summary = el.querySelector("summary");
    summary?.parentNode?.removeChild(summary);
    const body = markdownTurndown.turndown(el.innerHTML).trim();
    return `\n\n${open}${body}[/${open.slice(1).replace(/[=\]].*$/, "")}]\n\n`;
  },
});

/** Centred block — what the LaTeX image insert and [center] both produce. */
markdownTurndown.addRule("bbCenter", {
  filter: (node) =>
    node.nodeName === "DIV" && /^center$/i.test(getStyle(node as unknown as Element, "text-align")),
  replacement: (content) => `\n\n[center]${content.trim()}[/center]\n\n`,
});

/**
 * Lettered and roman lists: markdown has decimal ordered lists and nothing else.
 *
 * [li]…[/li] items, not [*] — core renders both (include/bbcode.php:1534), but
 * the body still has to survive MarkdownExtra on save, and "[*]" at the start
 * of a line is eaten as emphasis: "[*]one\n[*]two" comes back as
 * "[[i]]one\n[[/i]]two". Verified in scripts/markdown-to-bbcode.test.php.
 */
markdownTurndown.addRule("bbList", {
  filter: (node) => node.nodeName === "OL" && listMarker(node as unknown as Element) !== "1",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const items = Array.from(el.children)
      .filter((c) => c.nodeName === "LI")
      .map((li) => `[li]${markdownTurndown.turndown((li as HTMLElement).innerHTML).replace(/\n+/g, " ").trim()}[/li]`)
      .join("");
    return `\n\n[list=${listMarker(el as unknown as Element)}]${items}[/list]\n\n`;
  },
});

/**
 * A named quote. Markdown's ">" carries no attribution, so an authored quote
 * goes back as [quote=Author] — and the label span in front of it must not be
 * emitted a second time as loose text.
 */
markdownTurndown.addRule("bbQuote", {
  filter: (node) => node.nodeName === "BLOCKQUOTE" && !!quoteAuthor(node as unknown as Element),
  replacement: (content, node) =>
    `\n\n[quote=${quoteAuthor(node as unknown as Element)}]${content.trim()}[/quote]\n\n`,
});

markdownTurndown.addRule("bbQuoteLabel", {
  filter: (node) => node.nodeName === "SPAN" && isQuoteLabel(node as unknown as Element),
  replacement: () => "",
});

/**
 * GFM tables. Turndown has no table support of its own — without this a table
 * is flattened to loose paragraphs, which is silent data loss. Hand-rolled
 * rather than pulling in turndown-plugin-gfm: the bbcode path already
 * hand-rolls the mirror of this (htmlToSource.ts, `case "table"`), and the
 * plugin also carries strikethrough/task-list rules this editor doesn't use.
 */
markdownTurndown.addRule("table", {
  filter: "table",
  replacement: (_content, node) => {
    const rows = Array.from((node as HTMLElement).querySelectorAll("tr"));
    if (!rows.length) return "";

    // A pipe inside cell text would end the cell; newlines would end the row.
    const cells = (row: Element) =>
      Array.from(row.children).map((cell) =>
        markdownTurndown
          .turndown((cell as HTMLElement).innerHTML)
          .replace(/\n+/g, " ")
          .replace(/\|/g, "\\|")
          .trim(),
      );

    const align = Array.from(rows[0].children).map((cell) => {
      const a = (cell.getAttribute("align") ?? "").toLowerCase();
      return a === "center" ? ":-:" : a === "right" ? "--:" : a === "left" ? ":--" : "---";
    });

    const header = `| ${cells(rows[0]).join(" | ")} |`;
    const divider = `| ${align.join(" | ")} |`;
    const body = rows.slice(1).map((r) => `| ${cells(r).join(" | ")} |`);

    return `\n\n${[header, divider, ...body].join("\n")}\n\n`;
  },
});

/**
 * Fenced code blocks, with single newlines around the fence instead of
 * turndown's stock blank lines. Its default is meaning-preserving but it
 * *adds* a blank line the author never typed — "text\n```" came back as
 * "text\n\n```" on the first source ↔ WYSIWYG switch. A fence may interrupt a
 * paragraph in CommonMark, so the tighter form parses the same on the way back
 * (marked re-renders it to the identical <pre>), and a blank line the author
 * did type survives as the paragraph break that carries it.
 *
 * Copied from turndown's own fencedCodeBlock rule otherwise — including the
 * fence-lengthening for code that itself contains a fence.
 */
markdownTurndown.addRule("fencedCodeBlock", {
  filter: (node, options) =>
    options.codeBlockStyle === "fenced" &&
    node.nodeName === "PRE" &&
    node.firstChild != null &&
    node.firstChild.nodeName === "CODE",
  replacement: (_content, node, options) => {
    const code = (node as HTMLElement).firstChild as HTMLElement;
    const className = code.getAttribute("class") ?? "";
    const language = (className.match(/language-(\S+)/) ?? [null, ""])[1];
    const body = code.textContent ?? "";

    const stock = options.fence ?? "```";
    const fenceChar = stock.charAt(0);
    const longest = (body.match(new RegExp(`^${fenceChar}{3,}`, "gm")) ?? [])
      .reduce((max, m) => Math.max(max, m.length), 0);
    const fence = fenceChar.repeat(Math.max(longest + 1, stock.length));

    return `\n${fence}${language}\n${body.replace(/\n$/, "")}\n${fence}\n`;
  },
});

/**
 * HTML → Markdown for the WYSIWYG surface.
 *
 * Strips the zero-width caret anchors sourceToHtml places on either side of
 * every non-editable embed. Turndown treats them as ordinary text, so without
 * this they accumulate invisibly in the source on each round trip — the bbcode
 * path drops them the same way (nodeTobbcode in htmlToSource.ts).
 */
export function htmlToMarkdown(html: string): string {
  return tightenFences(markdownTurndown.turndown(html).replace(/\u200B/g, ""));
}

/**
 * Drop the blank lines around a top-level fenced code block.
 *
 * marked parses "text\n```" and "text\n\n```" into the identical
 * <p> + <pre>, so by the time turndown runs, whether the author left a blank
 * line there is unknowable — and turndown's block separator puts one in
 * regardless. That made every source ↔ WYSIWYG switch grow the body by two
 * lines around each fence. Since both spellings render the same, the tight one
 * wins and the round trip becomes a fixed point.
 *
 * Line-scanned rather than regex-replaced so the blank lines *inside* a code
 * block are never touched. Only fences indented less than four spaces are
 * considered — deeper ones belong to a list item, where the indentation is
 * load-bearing and turndown's own spacing is what keeps the item together.
 */
function tightenFences(md: string): string {
  const DELIM = /^ {0,3}(`{3,}|~{3,})/;
  const out: string[] = [];
  let fence = "";

  for (const line of md.split("\n")) {
    const m = DELIM.exec(line);
    if (m && !fence) {
      while (out.length && out[out.length - 1] === "") out.pop();
      fence = m[1][0];
    } else if (m && m[1][0] === fence) {
      fence = "";
      out.push(line);
      continue;
    } else if (!fence && line === "" && out.length && DELIM.test(out[out.length - 1])) {
      continue; // blank line straight after a closing fence
    }
    out.push(line);
  }

  return out.join("\n");
}
