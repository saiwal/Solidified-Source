/**
 * PlaceMap.tsx
 * Map for things that only have a free-text place ("Deutschland", "Berlin,
 * Germany"): the hub list and the directory. Each distinct place is geocoded
 * through /spa/geocode one at a time — the server spaces uncached lookups to
 * Nominatim's 1 request/second, so pins fill in progressively on a cold
 * cache and instantly after. Items sharing a place share one pin.
 */
import { createEffect, createMemo, createSignal, lazy, onCleanup, Show, Suspense, untrack } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { geocode, type Coord } from "@utsukta/spa-core/lib/osm";
import type { MapPoint } from "./MapView";

const MapView = lazy(() => import("./MapView"));

export interface PlaceItem {
  place: string;
  name: string;
  open: () => void;
}

// Session-wide: the hub and directory maps share most places.
const known = new Map<string, Coord | null>();

export default function PlaceMap(props: {
  items: PlaceItem[];
  /** Click on a pin shared by several items; default opens the first. */
  onGroup?: (place: string) => void;
}) {
  const { t } = useI18n();
  const [tick, setTick] = createSignal(0);
  let running = false;
  let disposed = false;
  onCleanup(() => { disposed = true; });

  const groups = createMemo(() => {
    const m = new Map<string, PlaceItem[]>();
    for (const it of props.items) {
      const p = it.place.trim();
      if (p) m.set(p, [...(m.get(p) ?? []), it]);
    }
    return m;
  });

  const pending = () => [...untrack(groups).keys()].filter((p) => !known.has(p));

  createEffect(() => {
    groups();
    if (running) return;
    running = true;
    void (async () => {
      for (let todo = pending(); todo.length && !disposed; todo = pending()) {
        for (const p of todo) {
          if (disposed) break;
          known.set(p, await geocode(p).catch(() => null));
          setTick((n) => n + 1);
        }
      }
      running = false;
    })();
  });

  const resolved = () => { tick(); return [...groups().keys()].filter((p) => known.has(p)).length; };

  const points = createMemo((): MapPoint[] => {
    tick();
    const out: MapPoint[] = [];
    for (const [place, items] of groups()) {
      const c = known.get(place);
      if (!c) continue;
      const names = items.slice(0, 3).map((i) => i.name).join(", ");
      const more = items.length > 3 ? ` ${t("ui.map_more", { count: items.length - 3 })}` : "";
      out.push({
        ...c,
        label: `${place} · ${names}${more}`,
        onClick: () => (items.length > 1 && props.onGroup ? props.onGroup(place) : items[0].open()),
      });
    }
    return out;
  });

  return (
    <div class="space-y-2">
      <Show when={resolved() < groups().size}>
        <p class="text-xs text-muted" aria-live="polite">
          {t("ui.map_locating", { done: resolved(), total: groups().size })}
        </p>
      </Show>
      <Suspense>
        <MapView points={points()} />
      </Suspense>
    </div>
  );
}
