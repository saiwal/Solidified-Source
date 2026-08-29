// Channel Sources — a connection whose public posts get re-owned by your
// channel and redistributed to your own connections.
// Backend: packages/spa-core/php/Api/Handlers/Sources.php

import { apiFetch } from "@utsukta/spa-core/lib/fetch";

/** src_xchan value meaning "any connection". */
export const ALL_CONNECTIONS = "*";

export interface Source {
  id: number;
  /** xchan hash, or ALL_CONNECTIONS. */
  xchan: string;
  /** null for the wildcard source — the UI supplies its own label. */
  name: string | null;
  photo: string | null;
  addr: string | null;
  /** MessageFilter include-pattern; blank = import all public content. */
  words: string;
  /** Comma-separated categories stamped onto imported posts. */
  tags: string;
  /** Rewrite the imported post's author to you (abconfig system/rself). */
  resend: boolean;
  /** False = the connection hasn't granted republish, so nothing is imported. */
  republish_granted: boolean;
}

export interface SourceInput {
  /** Omit or 0 to create. */
  id?: number;
  xchan: string;
  words: string;
  tags: string;
  resend: boolean;
}

async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? fallback);
  }
  return (await res.json()).data as T;
}

export async function fetchSources(): Promise<Source[]> {
  const res = await apiFetch("/spa/sources");
  return unwrap<Source[]>(res, "Failed to load sources");
}

export async function saveSource(input: SourceInput): Promise<Source> {
  const res = await apiFetch("/spa/sources", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return unwrap<Source>(res, "Failed to save source");
}

export async function deleteSource(id: number): Promise<void> {
  const res = await apiFetch(`/spa/sources/${id}`, { method: "DELETE" });
  await unwrap<unknown>(res, "Failed to delete source");
}
