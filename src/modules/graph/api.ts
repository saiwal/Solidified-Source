// API: /spa/links/* — see packages/spa-core/php/Api/Handlers/Links.php.
import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";

export type NodeType = "post" | "article" | "card" | "webpage" | "wiki" | "note" | "missing";
export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  /** null for a missing [[Title]] (nothing to open yet). */
  url: string | null;
}
export interface GraphEdge { source: string; target: string }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }

export const NODE_TYPES: NodeType[] = ["wiki", "article", "card", "webpage", "note", "post", "missing"];

// Categories, so raw palette colours (CLAUDE.md "Colour tokens"). Okabe–Ito,
// the colour-blind-safe set; its yellow is skipped (vanishes on light themes),
// and the two blues differ in lightness, not just hue.
export const TYPE_COLOR: Record<NodeType, string> = {
  wiki: "#0072B2", article: "#56B4E9", card: "#E69F00", webpage: "#D55E00",
  note: "#009E73", post: "#CC79A7", missing: "#999999",
};

async function get<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  return (json.data ?? json) as T;
}

export const fetchGraph = (nick: string) =>
  get<Graph>(`/spa/links/graph?nick=${encodeURIComponent(nick)}`);

export const fetchBacklinks = (path: string) =>
  get<{ node: GraphNode | null; from: GraphNode[] }>(`/spa/links/backlinks?path=${encodeURIComponent(path)}`);

export const resolveTitle = (nick: string, title: string) =>
  get<{ url: string | null }>(`/spa/links/resolve?nick=${encodeURIComponent(nick)}&title=${encodeURIComponent(title)}`);
