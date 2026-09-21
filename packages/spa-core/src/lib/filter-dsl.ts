// Structured view over Hubzilla's message-filter DSL (`Zotlabs\Lib\MessageFilter`).
//
// The DSL is a flat left-to-right fold with no precedence: `a\nb && c` evaluates
// as `(a || b) && c`, not `a || (b && c)`. So a box holds exactly ONE joiner —
// all newline (any) or all ` && ` (all). A string mixing them, or using a form
// the rows below can't express, fails to parse and the caller falls back to the
// raw textarea rather than silently rewriting what the user meant.

export type FilterField =
  | "text"      // substring of item.body
  | "regex"     // /re/ against item.body
  | "hashtag"   // #tag, #*, #>N
  | "mention"   // @name, @*, @>N
  | "category"  // $name, $*
  | "lang"      // lang=xx / lang!=xx
  | "until"     // until=<date>
  // Sender matching. MessageFilter's ?field tester is flat-key only, so these
  // read helper keys injected onto a copy of the row by FilesByRules.php. They
  // only resolve there — core's delivery-time evaluator has no such keys — so
  // they are offered by the auto-filing builder alone (see CORE_FIELDS).
  | "author"      // ?filter_author_name
  | "author_addr" // ?filter_author_addr
  | "raw";        // ?field OP value — the escape hatch, passed through verbatim

/** `is` = plain match, `not` = lang!= only, `any` = the `*` wildcard,
 *  `count` = `>N`, `contains` = substring (`~=`). */
export type FilterOp = "is" | "not" | "any" | "count" | "contains";

export interface FilterCond {
  field: FilterField;
  op: FilterOp;
  value: string;
}

export interface FilterRules {
  join: "any" | "all";
  conds: FilterCond[];
}

const SIGIL: Partial<Record<FilterField, string>> = {
  hashtag: "#",
  mention: "@",
  category: "$",
};

/** Which ops each field offers — drives the UI dropdown and validates a parse. */
export const FIELD_OPS: Record<FilterField, FilterOp[]> = {
  text: ["is"],
  regex: ["is"],
  hashtag: ["is", "any", "count"],
  mention: ["is", "any", "count"],
  category: ["is", "any"],
  lang: ["is", "not"],
  until: ["is"],
  author: ["contains", "is"],
  author_addr: ["is", "contains"],
  raw: ["is"],
};

/** Fields whose rules are evaluated by core at delivery — the connection and
 *  channel filter boxes. */
export const CORE_FIELDS: FilterField[] = [
  "text", "regex", "hashtag", "mention", "category", "lang", "until", "raw",
];

/** Everything, for rules the SPA evaluates itself (inbox auto-filing). */
export const ALL_FIELDS: FilterField[] = [
  "text", "regex", "hashtag", "mention", "category", "author", "author_addr",
  "lang", "until", "raw",
];

/** Item key each sender field reads — shared with the parser. */
const AUTHOR_KEY: Record<"author" | "author_addr", string> = {
  author: "?filter_author_name",
  author_addr: "?filter_author_addr",
};

export function compileCond(c: FilterCond): string {
  const value = c.value.trim();
  switch (c.field) {
    case "hashtag":
    case "mention":
    case "category": {
      const s = SIGIL[c.field]!;
      if (c.op === "any") return s + "*";
      if (c.op === "count") return `${s}>${value}`;
      return s + value;
    }
    case "lang":
      return (c.op === "not" ? "lang!=" : "lang=") + value;
    case "until":
      return "until=" + value;
    case "author":
    case "author_addr":
      return `${AUTHOR_KEY[c.field]} ${c.op === "is" ? "==" : "~="} ${value}`;
    case "regex":
      // A bare word is a common mistake — wrap it so it is a valid pattern.
      return /^\/.*\/[a-z]*$/.test(value) ? value : `/${value}/`;
    default:
      return value;
  }
}

export function compile(r: FilterRules): string {
  const parts = r.conds.map(compileCond).filter((s) => s.length > 0);
  return parts.join(r.join === "all" ? " && " : "\n");
}

function parseCond(raw: string): FilterCond | null {
  const s = raw.trim();
  if (!s) return null;

  for (const field of ["hashtag", "mention", "category"] as const) {
    const sigil = SIGIL[field]!;
    if (!s.startsWith(sigil)) continue;
    const rest = s.slice(1);
    if (rest === "*") return { field, op: "any", value: "" };
    // `$` has no count form in MessageFilter, and `#>x` with a non-number is a
    // literal tag search rather than a count.
    if (field !== "category" && /^>\d+$/.test(rest)) {
      return { field, op: "count", value: rest.slice(1) };
    }
    if (!rest) break;
    return { field, op: "is", value: rest };
  }

  if (s.startsWith("lang!=")) return { field: "lang", op: "not", value: s.slice(6).trim() };
  if (s.startsWith("lang=")) return { field: "lang", op: "is", value: s.slice(5).trim() };
  if (s.startsWith("until=")) return { field: "until", op: "is", value: s.slice(6).trim() };
  // Before the generic `?` fallback, or a sender rule would round-trip as raw.
  for (const field of ["author", "author_addr"] as const) {
    const m = s.match(new RegExp(`^\\${AUTHOR_KEY[field]} (==|~=) (.*)$`));
    if (m) return { field, op: m[1] === "==" ? "is" : "contains", value: m[2].trim() };
  }
  if (s.startsWith("?")) return { field: "raw", op: "is", value: s };
  if (s.startsWith("/")) return { field: "regex", op: "is", value: s };
  return { field: "text", op: "is", value: s };
}

/**
 * Split on the DSL's own delimiters, keeping them, so a box using more than one
 * joiner can be rejected. Mirrors MessageFilter::parse()'s regex; `\r` is not a
 * delimiter there either, it is trimmed off the phrase later.
 */
export function parse(s: string): FilterRules | null {
  if (!s.trim()) return { join: "any", conds: [] };

  const parts = s.split(/(\s\|\|\s|\s&&\s|\n)/);
  const conds: FilterCond[] = [];
  const joiners = new Set<"any" | "all">();

  for (let i = 0; i < parts.length; i++) {
    if (i & 1) {
      // A blank line is not a real joiner — it neighbours an empty phrase.
      if (parts[i - 1].trim() && parts[i + 1]?.trim()) {
        joiners.add(parts[i] === " && " ? "all" : "any");
      }
      continue;
    }
    const c = parseCond(parts[i]);
    if (c) conds.push(c);
  }

  if (joiners.size > 1) return null;                    // mixed precedence — hands off
  if (conds.some((c) => c.value.includes("\n"))) return null;
  return { join: joiners.has("all") ? "all" : "any", conds };
}
