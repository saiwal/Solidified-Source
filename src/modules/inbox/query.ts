// Gmail-style search operators for the inbox.
//
//   from:alice is:unread in:"folder 1" after:2026-01-01 budget report
//
// parses to the query params /spa/hq-messages already understands (see php
// Concerns/StreamFilters, shared with /spa/network), plus the leftover words as
// a body/title search. Pure — the UI just feeds it the input box's value, and
// the pills below write operators back into that same string, so there is one
// source of truth for "what is this list filtered by".

/** `key` → the query param it sets. A value-taking operator. */
const FIELD_OPS: Record<string, string> = {
  from: "author",
  // `contains:` is the explicit spelling of what bare words already do; its
  // value joins the free text rather than setting `search` directly, so
  // `contains:"weekly report" budget` searches for both.
  contains: "",
  body: "",
  in: "file",
  tag: "tag",
  label: "tag",
  category: "cat",
  cat: "cat",
  before: "dend",
  after: "dbegin",
  network: "net",
  net: "net",
};

/** `is:<x>` → the flag param it sets. */
const IS_OPS: Record<string, string> = {
  starred: "star",
  unread: "unread",
  dm: "dm",
  direct: "dm",
  private: "dm",
  following: "pf",
  mentioned: "conv",
  liked: "liked",
  spam: "spam",
};

/** `has:<x>` → the value for the `has` param. */
const HAS_OPS: Record<string, string> = {
  attachment: "attachment",
  attachments: "attachment",
  file: "attachment",
};

export interface ParsedQuery {
  /** Query params for /spa/hq-messages. */
  params: Record<string, string>;
  /** Words left over after the operators — the body/title search. */
  text: string;
  /** Operators that parsed but named nothing we support, verbatim. */
  unknown: string[];
}

// key:value, key:"quoted value", "quoted phrase", #tag, or a bare word.
//
// `\s*` after the colon on purpose: `from: alice` is what people actually type,
// and without it the whole thing silently degraded into a text search for the
// literal "from: alice". A trailing `from:` with nothing after it still needs a
// \S+ to match, so it stays plain text until you type the value.
const TOKEN = /(\w+):\s*"([^"]*)"|(\w+):\s*(\S+)|"([^"]*)"|(\S+)/g;

export function parseQuery(input: string): ParsedQuery {
  const params: Record<string, string> = {};
  const words: string[] = [];
  const unknown: string[] = [];

  for (const m of input.matchAll(TOKEN)) {
    const key = (m[1] ?? m[3])?.toLowerCase();
    const value = m[2] ?? m[4];

    if (key !== undefined && value !== undefined) {
      if (key === "is" && IS_OPS[value.toLowerCase()]) {
        params[IS_OPS[value.toLowerCase()]] = "1";
      } else if (key === "has" && HAS_OPS[value.toLowerCase()]) {
        params.has = HAS_OPS[value.toLowerCase()];
      } else if (FIELD_OPS[key] === "" && value !== "") {
        words.push(value);
      } else if (FIELD_OPS[key] && value !== "") {
        params[FIELD_OPS[key]] = value;
      } else {
        // Not an operator we know — a URL ("https://…") or someone typing a
        // colon mid-sentence. Treat it as search text rather than dropping it.
        unknown.push(m[0]);
        words.push(m[0]);
      }
      continue;
    }

    const bare = m[5] ?? m[6] ?? "";
    if (!bare) continue;
    // #tag is the one shorthand, matching the stream's own convention.
    if (m[6] && bare.startsWith("#") && bare.length > 1) params.tag = bare.slice(1);
    else words.push(bare);
  }

  const text = words.join(" ").trim();
  if (text) params.search = text;
  return { params, text, unknown };
}

/** Is this operator currently present in the query string? */
export function hasOperator(input: string, op: string): boolean {
  return parseQuery(input).params[opParam(op)] === opValue(op);
}

function opParam(op: string): string {
  const [k, v] = op.split(":");
  if (k === "is") return IS_OPS[v] ?? v;
  if (k === "has") return "has";
  return FIELD_OPS[k] || k;
}

function opValue(op: string): string {
  const [k, v] = op.split(":");
  if (k === "is") return "1";
  return HAS_OPS[v] ?? v;
}

/**
 * Add or remove a whole operator token in the raw string — what the filter
 * pills do. Editing the text rather than keeping separate pill state is the
 * point: the box always shows exactly what is being applied.
 */
export function toggleOperator(input: string, op: string): string {
  const present = hasOperator(input, op);
  const kept: string[] = [];
  const targetParam = opParam(op);

  for (const m of input.matchAll(TOKEN)) {
    const key = (m[1] ?? m[3])?.toLowerCase();
    const value = m[2] ?? m[4];
    // Drop any token that sets the same param, so toggling in:work while
    // in:personal is set replaces it instead of contradicting it.
    if (key !== undefined && value !== undefined) {
      const param = key === "is" ? IS_OPS[value.toLowerCase()]
                  : key === "has" ? "has"
                  : FIELD_OPS[key];
      if (param === targetParam) continue;
    }
    kept.push(m[0]);
  }

  if (!present) kept.push(op);
  return kept.join(" ").trim();
}

// ── Operator catalogue ──────────────────────────────────────────────────────
//
// One list, used by the parser's own docs and by the search bar's dropdown, so
// an operator can't exist in the picker without working, or work without being
// discoverable. Labels/hints are i18n keys, resolved by the component.

export interface OperatorInfo {
  /** What gets inserted into the box, colon included. */
  key: string;
  labelKey: string;
  hintKey: string;
  /** Fixed set of values to offer after the colon, if any. */
  values?: string[];
  /** Values come from the user's folders. */
  folderValues?: boolean;
}

export const OPERATORS: OperatorInfo[] = [
  { key: "from",     labelKey: "hq.op_from",     hintKey: "hq.op_from_hint" },
  { key: "contains", labelKey: "hq.op_contains", hintKey: "hq.op_contains_hint" },
  { key: "in",       labelKey: "hq.op_in",       hintKey: "hq.op_in_hint", folderValues: true },
  { key: "is",       labelKey: "hq.op_is",       hintKey: "hq.op_is_hint",
    values: ["unread", "starred", "dm", "mentioned", "following", "liked", "spam"] },
  { key: "has",      labelKey: "hq.op_has",      hintKey: "hq.op_has_hint", values: ["attachment"] },
  { key: "tag",      labelKey: "hq.op_tag",      hintKey: "hq.op_tag_hint" },
  { key: "after",    labelKey: "hq.op_after",    hintKey: "hq.op_after_hint" },
  { key: "before",   labelKey: "hq.op_before",   hintKey: "hq.op_before_hint" },
];

/**
 * The operator being typed at the end of the input, if any — what the hint
 * line under the box describes. Matching the tail (rather than tracking the
 * caret) is enough: picking from the dropdown appends, and typing happens at
 * the end too.
 */
export function trailingOperator(input: string): { info: OperatorInfo; value: string } | null {
  const m = /(\w+):(\s*)(\S*)$/.exec(input);
  if (!m) return null;
  const info = OPERATORS.find((o) => o.key === m[1].toLowerCase());
  return info ? { info, value: m[3] } : null;
}

/** Replace the trailing `key:` token's value — used when picking a suggestion. */
export function completeTrailing(input: string, value: string): string {
  return input.replace(/(\w+):(\s*)(\S*)$/, (_, k) => `${k}:${value}`) + " ";
}

/** Set a value operator (`after:`/`before:`), replacing any existing one. An
 *  empty value removes it — which is what clearing a date input means. */
export function setOperator(input: string, key: string, value: string): string {
  const kept: string[] = [];
  for (const m of input.matchAll(TOKEN)) {
    const k = (m[1] ?? m[3])?.toLowerCase();
    const v = m[2] ?? m[4];
    if (k === key && v !== undefined) continue;
    kept.push(m[0]);
  }
  if (value) kept.push(`${key}:${value}`);
  return kept.join(" ").trim();
}

/** The current value of a value operator, or "". */
export function operatorValue(input: string, key: string): string {
  return parseQuery(input).params[opParam(`${key}:`)] ?? "";
}
