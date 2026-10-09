// src/modules/network/views/StreamFilters.tsx
//
// Compact filter bar + view switcher.
// Search and connection filtering live in the StreamFilters widget (sidebar).

import { useSearchParams } from "@solidjs/router";
import { loadNetwork, loading, refreshing, resetPosts, softRefresh, viewMode, changeView, saveSortPref } from "../store";
import { ViewSwitcher, SortSelect, DEFAULT_RANGE, type SortOrder, type SortRange } from "@/shared/stream/filters";
import { MdFillRefresh } from "solid-icons/md";
import { helpable } from "@utsukta/spa-core/lib/helpable";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { parseNetworkParams } from "../api";
void helpable;

// ── Helpers ───────────────────────────────────────────────────────────────────

const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

// Ranked orders (Top, Hot, …) are behind Settings → Features → Network.
const BASIC_ORDERS: SortOrder[] = ["created", "commented", "unthreaded"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function StreamFilters() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Derived ───────────────────────────────────────────────────────────────

  const order      = (): SortOrder => (str(searchParams.order) as SortOrder) || "created";
  const range      = (): SortRange | undefined => (str(searchParams.range) as SortRange) || undefined;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function sp(overrides: Record<string, string | undefined>) {
    setSearchParams({ ...overrides }, { replace: true });
  }

  function apply() {
    resetPosts();
    loadNetwork(parseNetworkParams(searchParams));
  }

  function setOrderAndApply(o: SortOrder, r?: SortRange) {
    saveSortPref(o, r);
    sp({
      order: o === "created" ? undefined : o,
      // Absent means DEFAULT_RANGE, so only that one is omitted — "all" has
      // to be written out or it can't be selected.
      range: !r || r === DEFAULT_RANGE ? undefined : r,
    });
    setTimeout(apply, 0);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div class="space-y-1.5 pb-4 max-w-5xl mx-auto" use:helpable="network/index.activity-filters">

      {/* Single row: left=refresh+order · right=ViewSwitcher. Wraps on narrow screens. */}
      <div class="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-1 min-w-0">

        {/* ── Left: refresh + order ── */}
        <div class="flex items-center gap-1 min-w-0">
          <button
            onClick={softRefresh}
            disabled={loading() || refreshing()}
            title={t("network.refresh")}
            class="p-1.5 rounded-lg hover:bg-elevated transition-colors
                   disabled:opacity-40 text-muted hover:text-txt shrink-0
                   flex items-center justify-center"
          >
            <MdFillRefresh size={17} class={(loading() || refreshing()) ? "animate-spin" : ""} />
          </button>

          <SortSelect
            order={order()} range={range()} onChange={setOrderAndApply}
            available={isFeatureEnabled("spa_advanced_sort") ? undefined : BASIC_ORDERS}
          />
        </div>

        {/* ── Right: view switcher ── */}
        <div class="flex items-center gap-1 justify-end min-w-0">
          <ViewSwitcher viewMode={viewMode()} onChange={changeView} />
        </div>
      </div>

    </div>
  );
}
