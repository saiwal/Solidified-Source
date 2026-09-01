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
 * HTML → Markdown for the WYSIWYG surface.
 *
 * Strips the zero-width caret anchors sourceToHtml places on either side of
 * every non-editable embed. Turndown treats them as ordinary text, so without
 * this they accumulate invisibly in the source on each round trip — the bbcode
 * path drops them the same way (nodeTobbcode in htmlToSource.ts).
 */
export function htmlToMarkdown(html: string): string {
  return markdownTurndown.turndown(html).replace(/\u200B/g, "");
}
