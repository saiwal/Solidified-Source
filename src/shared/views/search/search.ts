// Unified search: GET /spa/find (Handlers/Find.php), shared by the desktop
// Ctrl+K palette and the mobile app drawer's search.
import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
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

async function find(p: FindFilters & { term: string }): Promise<FindResult[]> {
  const q = new URLSearchParams({ term: p.term });
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
export function useContentSearch(term: Accessor<string>, filters: Accessor<FindFilters>, enabled: Accessor<boolean>) {
  const [settled, setSettled] = createSignal<(FindFilters & { term: string }) | null>(null);
  createEffect(() => {
    const p = { ...filters(), term: term().trim() };
    const ready = enabled() && (p.term.length >= 2 || p.tag.trim() !== "");
    const id = setTimeout(() => setSettled(ready ? p : null), 200);
    onCleanup(() => clearTimeout(id));
  });
  const [results] = createQueryResource("find", settled, find);
  return { results, active: () => settled() !== null };
}
