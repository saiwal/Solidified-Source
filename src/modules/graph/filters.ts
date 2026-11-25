// Graph filters, shared by the map (GraphView) and its sidebar widget
// (GraphFiltersWidget) — module-level, so both read one state. Per browser.
import { createSignal } from "solid-js";
import { ITEM_TYPES, NODE_TYPES, TERM_TYPES, type Graph, type GraphNode } from "./api";

// One set of hidden keys: a node type ("post", "tag"…), "unlinked" (posts with
// no visible link), or a single term's node id ("tag:garden", "cat:recipes").
// v3: hashtags and categories start hidden, like "Not yet written".
const HIDDEN_KEY = "hz-graph-hidden-v3";
const OLD_KEY = "hz-graph-hidden-v2";
const DRAFTS_KEY = "hz-graph-drafts";

const valid = (x: unknown): x is string =>
  typeof x === "string" && (x === "unlinked" || NODE_TYPES.includes(x as never) || /^(tag|cat):./.test(x));

function readHidden(): Set<string> {
  try {
    const v3 = localStorage.getItem(HIDDEN_KEY);
    // No v3 yet: carry the v2 choices over, with the new term types hidden.
    const raw = v3 ?? JSON.stringify([...JSON.parse(localStorage.getItem(OLD_KEY) ?? '["missing"]'), ...TERM_TYPES]);
    const v = JSON.parse(raw);
    return new Set(Array.isArray(v) ? v.filter(valid) : []);
  } catch {
    return new Set(["missing", ...TERM_TYPES]);
  }
}

const [hidden, setHidden] = createSignal<Set<string>>(readHidden());
export { hidden };

export const isShown = (key: string) => !hidden().has(key);

export function toggleShown(key: string) {
  setHidden((s) => {
    const n = new Set(s);
    n.has(key) ? n.delete(key) : n.add(key);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...n]));
    } catch {
      // private mode / storage full — the filter just won't persist
    }
    return n;
  });
}

// Drafts only ever reach the owner; off until they switch them on.
const [showDrafts, setShowDrafts] = createSignal((() => {
  try { return localStorage.getItem(DRAFTS_KEY) === "1"; } catch { return false; }
})());
export { showDrafts };

export function toggleDrafts() {
  setShowDrafts((v) => {
    try { localStorage.setItem(DRAFTS_KEY, v ? "0" : "1"); } catch { /* won't persist */ }
    return !v;
  });
}

const isTerm = (n: GraphNode) => TERM_TYPES.includes(n.type);

/** Nodes left with no edge after a filter: missing titles, tags, categories. */
function dropOrphans(g: Graph): Graph {
  const used = new Set(g.edges.flatMap((e) => [e.source, e.target]));
  return { nodes: g.nodes.filter((n) => (n.type !== "missing" && !isTerm(n)) || used.has(n.id)), edges: g.edges };
}

/** The graph minus drafts when they're off — and minus anything only a draft
 *  pointed at (Links::withoutDrafts() does the same server-side). */
export function baseGraph(g: Graph | undefined, drafts: boolean): Graph | null {
  if (!g) return null;
  if (drafts || !g.nodes.some((n) => n.draft)) return g;
  const ids = new Set(g.nodes.filter((n) => n.draft).map((n) => n.id));
  return dropOrphans({
    nodes: g.nodes.filter((n) => !n.draft),
    edges: g.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
  });
}

/** Items per tag/category, most-used first. Only terms on two or more items:
 *  one on a single item connects nothing, so the map never shows it. */
export function termCounts(g: Graph | null, type: "tag" | "category") {
  if (!g) return [];
  const uses = new Map<string, number>();
  for (const e of g.edges) if (e.kind) uses.set(e.target, (uses.get(e.target) ?? 0) + 1);
  return g.nodes
    .filter((n) => n.type === type && (uses.get(n.id) ?? 0) >= 2)
    .map((n) => ({ node: n, count: uses.get(n.id)! }))
    .sort((a, b) => b.count - a.count || a.node.title.localeCompare(b.node.title));
}

/** What the map draws under the current filters. */
export function visibleGraph(g: Graph | null, h: Set<string>): Graph | null {
  if (!g) return null;
  let nodes = g.nodes.filter((n) => !h.has(n.type) && !h.has(n.id));
  let ids = new Set(nodes.map((n) => n.id));
  let edges = g.edges.filter((e) => ids.has(e.source) && ids.has(e.target));

  // A term on fewer than two *visible* items connects nothing.
  const uses = new Map<string, number>();
  for (const e of edges) if (e.kind) uses.set(e.target, (uses.get(e.target) ?? 0) + 1);
  nodes = nodes.filter((n) => !isTerm(n) || (uses.get(n.id) ?? 0) >= 2);

  // "Unlinked posts" off: drop posts with no visible link or shared term —
  // including one whose links all went to a type that's hidden right now.
  ids = new Set(nodes.map((n) => n.id));
  edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  if (h.has("unlinked")) {
    const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
    nodes = nodes.filter((n) => n.type !== "post" || linked.has(n.id));
  }
  return { nodes, edges };
}

export const presentItemTypes = (g: Graph | null) => ITEM_TYPES.filter((ty) => g?.nodes.some((n) => n.type === ty));
