// Unified search: GET /spa/find (Handlers/Find.php), shared by the desktop
// Ctrl+K palette and the mobile app drawer's search.
import { createSignal, type Accessor, createEffect } from "solid-js";
import { isLocalUser, useAuth } from "@utsukta/spa-core/store/auth-store";
import { useSubjectNick } from "@utsukta/spa-core/store/site-config";
import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";

export type FindType = "post" | "article" | "card" | "webpage" | "wiki" | "note" | "file" | "bookmark";
export const FIND_TYPES: FindType[] = ["wiki", "article", "card", "webpage", "note", "post", "file", "bookmark"];

// Reuse the nav icons each kind already has.
export const FIND_ICON: Record<FindType, string> = {
  post: "post", article: "articles", card: "cards", webpage: "webpages", wiki: "wiki",
  note: "notepad", file: "cloud", bookmark: "bookmark",
};

export interface FindResult {
  type: FindType;
  id: string;
  title: string;
  snippet: string;
  url: string;
  created: string | null;
  external?: boolean;
}

export interface FindFilters { types: FindType[]; tag: string; dbegin: string; dend: string }
export const emptyFilters = (): FindFilters => ({ types: [], tag: "", dbegin: "", dend: "" });

const [paletteOpen, setPaletteOpen] = createSignal(false);
export { paletteOpen, setPaletteOpen };

type FindParams = FindFilters & { term: string; channel: string };

/**
 * Whose content a search covers: on another channel's page, that channel's
 * (what the viewer may see of it — works for visitors too); anywhere else,
 * your own. `channel` is "" for your own, which needs a local login.
 */
export function useSearchScope() {
  const auth = useAuth();
  const subject = useSubjectNick();
  // isLocal first: for a visitor on /channel/<nick>, auth().nick is the *page*
  // channel's nick (it comes from /spa/pconfig?channel=), not their own.
  const mine = () => !!auth()?.isLocal && auth()?.nick === subject();
  const channel = () => (subject() && !mine() ? subject() : "");
  return {
    channel,
    canSearch: () => isLocalUser() || channel() !== "",
    // Notes and bookmarks are never searchable on someone else's channel.
    types: () => (channel() ? FIND_TYPES.filter((ty) => ty !== "note" && ty !== "bookmark") : FIND_TYPES),
  };
}

async function find(p: FindParams): Promise<FindResult[]> {
  const q = new URLSearchParams({ term: p.term });
  if (p.channel) q.set("channel", p.channel);
  if (p.types.length) q.set("types", p.types.join(","));
  if (p.tag) q.set("tag", p.tag.replace(/^#/, ""));
  if (p.dbegin) q.set("dbegin", p.dbegin);
  if (p.dend) q.set("dend", p.dend);
  const res = await apiFetch(`/spa/find?${q}`);
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  return (json.data ?? json).results ?? [];
}

/** Debounced content search; idle (no request) until there's a 2+ char term or a tag. */
export function useContentSearch(
  term: Accessor<string>, filters: Accessor<FindFilters>, enabled: Accessor<boolean>,
  channel: Accessor<string> = () => "",
) {
  const [settled, setSettled] = createSignal<FindParams | null>(null);
  createEffect(() => {
    const p = { ...filters(), term: term().trim(), channel: channel() };
    return { p, ready: enabled() && (p.term.length >= 2 || p.tag.trim() !== "") };
  }, ({ p, ready }) => {
    const id = setTimeout(() => setSettled(ready ? p : null), 200);
    return () => clearTimeout(id);
  });
  const [results] = createQueryResource("find", settled, find);
  return { results, active: () => settled() !== null };
}
