// modules/directory/connections/store.ts
//
// Same imperative shape as ../people/store.ts: the accumulated list and the
// offset live together in the store, so a remount of ConnectionsSection
// re-renders what's already loaded instead of resetting the list to page 1
// while the offset marches on.

import { createSignal } from 'solid-js';
import { toast } from '@utsukta/spa-core/store/toast';
import type { Connection, ConnectionFilter, ConnectionOrder } from './api';
import { fetchConnections } from './api';

export const LIMIT = 20;

// ── State ─────────────────────────────────────────────────────────────────────

export const [filter, setFilter] = createSignal<ConnectionFilter>('active');
export const [order,  setOrder]  = createSignal<ConnectionOrder>('name');
export const [search, setSearch] = createSignal('');

const [connections, setConnections] = createSignal<Connection[]>([]);
const [loading,     setLoading]     = createSignal(false);
const [loadingMore, setLoadingMore] = createSignal(false);
const [hasMore,     setHasMore]     = createSignal(false);
const [total,       setTotal]       = createSignal(0);

let currentStart = 0;

// ── Actions ───────────────────────────────────────────────────────────────────

/** Reload from offset 0 — call after changing filter/order/search, or on a
 *  first mount with an empty store. */
export async function loadConnections() {
  currentStart = 0;
  setLoading(true);
  setHasMore(false);
  try {
    const data = await fetchConnections({
      filter: filter(), order: order(), search: search(), start: 0, limit: LIMIT,
    });
    setConnections(data.connections);
    setTotal(data.meta.total);
    currentStart = data.connections.length;
    setHasMore(data.connections.length >= LIMIT);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Unknown error');
    setConnections([]);
  } finally {
    setLoading(false);
  }
}

/** Append the next page. The loadingMore/hasMore guard is synchronous, so a
 *  scroll that fires the observer twice can't start two fetches. */
export async function loadMoreConnections() {
  if (loading() || loadingMore() || !hasMore()) return;
  setLoadingMore(true);
  try {
    const data = await fetchConnections({
      filter: filter(), order: order(), search: search(),
      start: currentStart, limit: LIMIT,
    });
    // /spa/connections orders by name with no guaranteed tiebreaker, so a page
    // boundary can repeat a row.
    const seen = new Set(connections().map((c) => c.xchan_hash));
    const fresh = data.connections.filter((c) => !seen.has(c.xchan_hash));
    setConnections((prev) => [...prev, ...fresh]);
    setTotal(data.meta.total);
    currentStart += data.connections.length;   // raw length, or the offset drifts
    setHasMore(data.connections.length >= LIMIT);
  } catch (err) {
    console.error('Load more connections failed:', err);
  } finally {
    setLoadingMore(false);
  }
}

/** Alias kept for ImportConnectionsModal. */
export const refetch = loadConnections;

export { connections, loading, loadingMore, hasMore, total };
