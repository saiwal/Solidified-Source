import { mapActivityToPost } from "@utsukta/spa-core/lib/activity.mapper";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";

export interface CardListResponse {
  meta: { offset: number; limit: number; root_count: number };
  cards: Post[];
}

export interface CardSingleResponse {
  card: Post;
  comments: Post[];
}

export async function fetchCards(
  nick: string,
  params: { start?: number; search?: string; tag?: string; cat?: string; dbegin?: string; dend?: string; deck?: string } = {},
): Promise<CardListResponse> {
  const q = new URLSearchParams();
  if (params.start) q.set("start", String(params.start));
  if (params.search) q.set("search", params.search);
  if (params.tag) q.set("tag", params.tag);
  if (params.cat) q.set("cat", params.cat);
  if (params.dbegin) q.set("dbegin", params.dbegin);
  if (params.dend) q.set("dend", params.dend);
  if (params.deck) q.set("deck", params.deck);
  const qs = q.toString();
  const res = await fetch(`/spa/cards/${nick}${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch cards");
  const json = await res.json();
  return {
    cards: (json.data ?? []).map(mapActivityToPost),
    meta: json.meta,
  };
}

export interface DeckSummary {
  name: string;
  count: number;
  min_order: number | null;
  max_order: number | null;
}

export async function fetchDeckList(nick: string): Promise<DeckSummary[]> {
  const res = await fetch(`/spa/cards/${nick}/deck`);
  if (!res.ok) throw new Error("Failed to fetch decks");
  const json = await res.json();
  return json.data?.decks ?? [];
}

export async function fetchDeckDetail(
  nick: string,
  name: string,
): Promise<{ name: string; cards: Post[] }> {
  const res = await fetch(`/spa/cards/${nick}/deck/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Failed to fetch deck");
  const json = await res.json();
  return {
    name: json.data?.name ?? name,
    cards: (json.data?.cards ?? []).map(mapActivityToPost),
  };
}

export async function renameDeck(nick: string, from: string, to: string): Promise<void> {
  const res = await apiFetch(`/spa/cards/${nick}/deck-rename`, {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Rename failed");
  }
}

export async function reorderDeck(
  nick: string,
  deck: string,
  order: string[],
): Promise<void> {
  const res = await apiFetch(`/spa/cards/${nick}/deck-reorder`, {
    method: "POST",
    body: JSON.stringify({ deck, order }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Reorder failed");
  }
}

// ── Kanban board ──────────────────────────────────────────────────────────────
// Board config only; a board's cards come from fetchCards(cat: <board name>),
// which is permission-filtered server-side like every other card list.

/** A board is a category: its cards carry `name` as a category, its columns are decks. */
export interface KanbanBoardDef {
  name: string;
  columns: string[];
}

export interface KanbanConfig {
  enabled: boolean;
  boards: KanbanBoardDef[];
}

export async function fetchKanban(nick: string): Promise<KanbanConfig> {
  const res = await fetch(`/spa/cards/${nick}/kanban`);
  if (!res.ok) throw new Error("Failed to fetch kanban config");
  const json = await res.json();
  return {
    enabled: !!json.data?.enabled,
    boards: json.data?.boards ?? [],
  };
}

export async function saveKanbanBoards(
  nick: string,
  boards: KanbanBoardDef[],
): Promise<KanbanBoardDef[]> {
  const res = await apiFetch(`/spa/cards/${nick}/kanban-boards`, {
    method: "POST",
    body: JSON.stringify({ boards }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Saving boards failed");
  }
  return (await res.json()).data?.boards ?? boards;
}

/** Rename a board = retag its cards (a board is a category). */
export async function renameBoard(nick: string, from: string, to: string): Promise<void> {
  const res = await apiFetch(`/spa/cards/${nick}/board-rename`, {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Rename failed");
  }
}

/** Move a card into a deck (kanban column), or out of every deck when deck is "". */
export async function moveCard(
  nick: string,
  uuid: string,
  deck: string,
  order: number,
): Promise<void> {
  const res = await apiFetch(`/spa/cards/${nick}/deck-move`, {
    method: "POST",
    body: JSON.stringify({ uuid, deck, order }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Move failed");
  }
}

export async function fetchCard(
  nick: string,
  uuid: string,
): Promise<CardSingleResponse> {
  const res = await fetch(
    `/spa/cards/${nick}?uuid=${encodeURIComponent(uuid)}`,
  );
  if (!res.ok) throw new Error("Failed to fetch card");
  const json = await res.json();
  return {
    card: mapActivityToPost(json.data.card),
    comments: (json.data.comments ?? []).map(mapActivityToPost),
  };
}

export async function deleteCard(uuid: string): Promise<void> {
  const res = await apiFetch(`/spa/item/${uuid}/delete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "Delete failed");
  }
}

// Lightweight list for the editor's card picker — the full fetchCards result
// carries whole bodies, which the picker never shows.
export interface CardPickerEntry {
  iid: number;
  uuid: string;
  title: string;
  cover: string;
  deck: string | null;
}

export async function fetchCardsPickerList(
  nick: string,
  params: { search?: string; start?: number } = {},
): Promise<CardPickerEntry[]> {
  const { cards } = await fetchCards(nick, params);
  return cards.map((c) => ({
    iid: (c as unknown as { iid: number }).iid,
    uuid: c.uuid,
    title: c.title ?? "",
    cover: firstImage(c.body ?? ""),
    deck: (c as unknown as { deck?: { name: string } | null }).deck?.name ?? null,
  }));
}

function firstImage(body: string): string {
  return body.match(/\[z?img[^\]]*\](.*?)\[\/z?img\]/i)?.[1]?.trim() ?? "";
}
