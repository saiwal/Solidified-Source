import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import type { StreamAttachment } from "@utsukta/spa-core/types/post.types";

export type Note = {
  id: number;
  mid: string;
  uuid: string;
  body: string;
  created: string;
  edited: string;
  mimetype: string;
  attach: StreamAttachment[];
};

export type NotesResponse = {
  data: Note[];
  meta: {
    offset: number;
    limit: number;
    count: number;
    has_more: boolean;
  };
};

export type NoteFilters = {
  tag?: string;
  cat?: string;
  dbegin?: string;
  dend?: string;
  search?: string;
};

export async function fetchNotes(
  start = 0,
  limit = 20,
  filters: NoteFilters = {},
): Promise<NotesResponse> {
  const params = new URLSearchParams({ start: String(start), limit: String(limit) });
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.cat) params.set("cat", filters.cat);
  if (filters.dbegin) params.set("dbegin", filters.dbegin);
  if (filters.dend) params.set("dend", filters.dend);
  if (filters.search) params.set("search", filters.search);
  const res = await apiFetch(`/spa/notes?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Failed to fetch notes");
  }
  return res.json() as Promise<NotesResponse>;
}

export async function deleteNote(uuid: string): Promise<void> {
  const res = await apiFetch(`/spa/item/${uuid}/delete`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? "Delete failed");
  }
}
