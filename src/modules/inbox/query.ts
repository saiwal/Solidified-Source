// Gmail-style search operators for the inbox.
//
//   from:alice is:unread in:"folder 1" after:2026-01-01 budget report
//
// parses to the query params /spa/hq-messages already understands (see php
// Concerns/StreamFilters, shared with /spa/network), plus the leftover words as
// a body/title search. Pure. The inbox's filter panel writes plain URL params;
// this is what still lets its search box take typed operators on top.

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
