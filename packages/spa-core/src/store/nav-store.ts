// shared/store/nav-store.ts
//
// Nav data via TanStack Query — reactive to the current channel nick.
// The query refetches whenever the subject nick changes, returning viewer info,
// pinned/featured apps, and channel_tabs all in one request.
//
// Cached under ["nav", nick]: every component asking for the same nick shares
// one request and one cache entry, revisits render instantly from cache, and
// the data revalidates on window focus/reconnect (see shared/lib/query-client).

import { createSignal } from "solid-js";
import { useQuery, keepPreviousData } from "../lib/query";
import { fetchNavApi, type NavApiResponse } from "../lib/nav-api";
import type { NavApp, NavChannel } from "../lib/nav-api";
import { queryClient } from "../lib/query-client";

// ── Channel nick signal ───────────────────────────────────────────────────────
//
// Initialised from the URL so the very first fetch already includes the nick.
// Layout.tsx keeps it in sync on SPA navigation via setNavNick().

function nickFromUrl(): string {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const withNick = [
    "channel", "about", "photos", "articles", "cart", "chat",
    "calendar", "cloud", "webpages", "wiki", "cal", "page",
  ];
  return (parts[1] && withNick.includes(parts[0])) ? parts[1] : "";
}

const [navNick, setNavNick] = createSignal<string>(nickFromUrl());

export { setNavNick };

// ── Query ─────────────────────────────────────────────────────────────────────
//
// Reactive to navNick: fetches /api/nav?channel_nick=<nick> when nick is set,
// /api/nav otherwise. Includes channel_tabs in the response when nick is present.
//
// keepPreviousData mirrors createResource behaviour: while the new nick's data
// loads, the accessor still returns the previous data and `.loading` is true.

/** Resource-style accessor: call for data, read `.loading` for fetch state. */
export type NavDataAccessor = {
  (): NavApiResponse | undefined;
  readonly loading: boolean;
};

function useNavQuery() {
  return useQuery(() => {
    const nick = navNick();
    return {
      queryKey: ["nav", nick] as const,
      queryFn: () => fetchNavApi(nick || undefined),
      placeholderData: keepPreviousData,
    };
  });
}

export function useNavData(): NavDataAccessor {
  const query = useNavQuery();
  const accessor = (() => query.data) as NavDataAccessor;
  Object.defineProperty(accessor, "loading", {
    get: () => query.isPending || query.isPlaceholderData,
  });
  return accessor;
}

/** Drop cached nav data and refetch — call after installing/uninstalling apps. */
export function refetchNavData() {
  return queryClient.invalidateQueries({ queryKey: ["nav"] });
}

// ── Derived: pinned / featured apps ──────────────────────────────────────────

export function usePinnedApps(): () => NavApp[] {
  const navData = useNavData();
  return () => navData()?.pinned ?? [];
}

export function useFeaturedApps(): () => NavApp[] {
  const navData = useNavData();
  return () => navData()?.featured ?? [];
}

export function useSystemApps(): () => NavApp[] {
  const navData = useNavData();
  return () => navData()?.system_apps ?? [];
}

// ── Derived: channel tabs ─────────────────────────────────────────────────────
//
// Channel tabs are included in navData when channel_nick is set.
// Returns the accessor directly so callers can check .loading.

export function useChannelNav(_nick?: () => string | undefined): NavDataAccessor {
  return useNavData();
}

// ── Derived: viewer / actions / installed apps ────────────────────────────────

export function useNavViewer() {
  const navData = useNavData();
  return () => navData()?.viewer;
}

export function useNavActions() {
  const navData = useNavData();
  return () => navData()?.actions ?? {};
}

export function useInstalledApps(): () => Set<string> {
  const navData = useNavData();
  return () => new Set(navData()?.installed_apps ?? []);
}

// ── Derived: multi-channel switcher ──────────────────────────────────────────

export function useNavChannels(): () => NavChannel[] {
  const navData = useNavData();
  return () => navData()?.channels ?? [];
}

export function useNavChannelSelectEnabled(): () => boolean {
  const navData = useNavData();
  return () => navData()?.nav_channel_select ?? false;
}
