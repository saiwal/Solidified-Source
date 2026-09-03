// src/modules/network/views/StreamFilters.tsx
//
// Compact filter bar + view switcher.
// Search and connection filtering live in the StreamFilters widget (sidebar).

import { Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { loadNetwork, loading, refreshing, resetPosts, softRefresh, viewMode, changeView } from "../store";
import { ViewSwitcher, SortSelect, DEFAULT_RANGE, type SortOrder, type SortRange } from "@/shared/stream/filters";
import { MdFillRefresh, MdFillClose } from "solid-icons/md";
import { helpable } from "@utsukta/spa-core/lib/helpable";
import { useI18n } from "@utsukta/spa-core/i18n";
import { parseNetworkParams } from "../api";
void helpable;

// ── Helpers ───────────────────────────────────────────────────────────────────

const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

// ── Component ─────────────────────────────────────────────────────────────────

export default function StreamFilters() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Derived ───────────────────────────────────────────────────────────────

  const order      = (): SortOrder => (str(searchParams.order) as SortOrder) || "created";
  const range      = (): SortRange | undefined => (str(searchParams.range) as SortRange) || undefined;
  const search     = ()        => str(searchParams.search);
  const tag        = ()        => str(searchParams.tag);
  const file       = ()        => str(searchParams.file);
  const star       = ()        => searchParams.star  === "1";
  const pf         = ()        => searchParams.pf    === "1";
  const conv       = ()        => searchParams.conv  === "1";
  const dm         = ()        => searchParams.dm    === "1";
  const event      = ()        => searchParams.event === "1";
  const dbegin     = ()        => str(searchParams.dbegin);
  const dend       = ()        => str(searchParams.dend);
  const cmin       = ()        => str(searchParams.cmin);
  const cmax       = ()        => str(searchParams.cmax);
  const cid        = ()        => str(searchParams.cid);
  const gid        = ()        => str(searchParams.gid);

  const hasAdvanced   = () => !!(tag() || file() || dbegin() || dend() || cmin() || cmax());
  const hasAnyFilter  = () =>
    order() !== "created" || !!search() || star() || pf() || conv() || dm() || event() ||
    hasAdvanced() || !!(cid() || gid());

  // ── Helpers ───────────────────────────────────────────────────────────────

  function sp(overrides: Record<string, string | undefined>) {
    setSearchParams({ ...overrides }, { replace: true });
  }

  function apply() {
    resetPosts();
    loadNetwork(parseNetworkParams(searchParams));
  }

  function setOrderAndApply(o: SortOrder, r?: SortRange) {
    sp({
      order: o === "created" ? undefined : o,
      // Absent means DEFAULT_RANGE, so only that one is omitted — "all" has
      // to be written out or it can't be selected.
      range: !r || r === DEFAULT_RANGE ? undefined : r,
    });
    setTimeout(apply, 0);
  }

  function clearAll() {
    setSearchParams(
      {
        order: undefined, range: undefined, search: undefined, tag: undefined, file: undefined,
        star: undefined, pf: undefined, conv: undefined, dm: undefined, event: undefined,
        dbegin: undefined, dend: undefined,
        cmin: undefined, cmax: undefined,
        cid: undefined, gid: undefined, xchan_label: undefined,
      },
      { replace: true },
    );
    setTimeout(apply, 0);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div class="space-y-1.5 pb-4 max-w-5xl mx-auto" use:helpable="network/index.activity-filters">

      {/* Single row: left=refresh+order · right=ViewSwitcher+clear. Wraps on narrow screens. */}
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

          <SortSelect order={order()} range={range()} onChange={setOrderAndApply} />
        </div>

        {/* ── Right: view switcher + clear ── */}
        <div class="flex items-center gap-1 justify-end min-w-0">
          <ViewSwitcher viewMode={viewMode()} onChange={changeView} />

          {/* Clear all */}
          <Show when={hasAnyFilter()}>
            <button onClick={clearAll} title={t("network.clear_filters")}
              class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted
                     hover:text-accent hover:bg-elevated transition-colors shrink-0">
              <MdFillClose size={13} />
              <span class="hidden sm:inline">{t("network.clear_filters")}</span>
            </button>
          </Show>
        </div>
      </div>

    </div>
  );
}
