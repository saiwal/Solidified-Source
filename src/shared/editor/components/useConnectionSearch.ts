/**
 * useConnectionSearch.ts
 * Shared debounced-contact/group-search pattern: a small initial page so the
 * list isn't empty on open, replaced by a debounced server search once the
 * query reaches `minChars`. Extracted from AclPicker's contacts search
 * (which now consumes this hook) so RecipientField's "To:" search can reuse
 * the exact same logic and — via matching cache-key prefixes — the same
 * TanStack query cache.
 */

import { createSignal, createEffect, on } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchConnections, type AclEntry } from "@/modules/network/api";

export interface ConnectionSearchOptions {
  /** Skip fetching entirely (e.g. when the caller supplies a pre-fetched list). Default: always enabled. */
  enabled?: () => boolean;
  initialCount?: number;
  searchCount?: number;
  minChars?: number;
  debounceMs?: number;
  /** Cache-key prefix for the underlying query resources — share a prefix to share the cache. */
  cacheKeyPrefix?: string;
}

export interface ConnectionSearch {
  query: () => string;
  setQuery: (v: string) => void;
  searching: () => boolean;
  loading: () => boolean;
  /** Small initial page (before the query reaches minChars). */
  initial: () => AclEntry[];
  /** Debounced server-search results (once query length >= minChars). */
  results: () => AclEntry[];
  /** initial() when not searching, results() when searching. */
  list: () => AclEntry[];
}

const MIN_CHARS_DEFAULT = 3;
const DEBOUNCE_MS_DEFAULT = 250;

export function useConnectionSearch(
  type: "a" | "c" | "g" | "m",
  opts: ConnectionSearchOptions = {},
): ConnectionSearch {
  const enabled = opts.enabled ?? (() => true);
  const minChars = opts.minChars ?? MIN_CHARS_DEFAULT;
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS_DEFAULT;
  const defaultPrefix =
    type === "c" ? "acl-contacts"
    : type === "a" ? "acl-abook"
    : type === "m" ? "acl-mail-contacts"
    : "acl-groups";
  const prefix = opts.cacheKeyPrefix ?? defaultPrefix;

  const [query, setQuery] = createSignal("");

  // The unprompted on-mount page always uses "a" (abook only). Core's "c" with
  // an empty search runs an unfiltered, LIMIT-less scan of the whole xchan
  // table (Acl.php: `if(count($r) < 100 && $type == 'c')`) — slow, and it lists
  // channels you aren't connected to. Typed searches keep the caller's type so
  // "c" can still reach a non-connection.
  const initialType = type === "c" ? "a" : type;

  const [initialRes] = createQueryResource(
    `${prefix}-initial-${initialType}`,
    enabled,
    () => fetchConnections({ type: initialType, count: opts.initialCount ?? 10 }),
  );

  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  let debounceTimer: number | undefined;
  createEffect(on(query, (q) => {
    window.clearTimeout(debounceTimer);
    const trimmed = q.trim();
    if (trimmed.length < minChars) {
      setDebouncedQuery("");
      return;
    }
    debounceTimer = window.setTimeout(() => setDebouncedQuery(trimmed), debounceMs);
  }));

  const [searchRes] = createQueryResource(
    `${prefix}-search`,
    () => (enabled() && debouncedQuery()) || false,
    (q) => fetchConnections({ type, search: q, count: opts.searchCount ?? 50 }),
  );

  const searching = () => query().trim().length >= minChars;
  const loading = () => enabled() && (searching() ? searchRes.loading : initialRes.loading);

  // Core ignores `count` for contacts (it only LIMITs the privacy-group query),
  // so the initial page is trimmed here.
  const initial = () => (initialRes() ?? []).slice(0, opts.initialCount ?? 10);
  const results = () => searchRes() ?? [];
  const list = () => (searching() ? results() : initial());

  return { query, setQuery, searching, loading, initial, results, list };
}
