/**
 * ChannelPlacesWidget.tsx
 * Opt-in map of the channel's wall posts that carry coordinates (item.coord —
 * set by the composer's location button or a geotagged photo). A pin opens the
 * post's thread. Renders nothing while maps are off (see useMapsEnabled).
 */
import { lazy, Show, Loading } from "solid-js";
import { createAsyncResource } from "@utsukta/spa-core/lib/createAsyncResource";
import AsyncBoundary from "@/shared/views/AsyncBoundary";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { parseCoord } from "@utsukta/spa-core/lib/osm";
import { useMapsEnabled } from "@utsukta/spa-core/lib/useOsmMap";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { WidgetShell } from "@ui/WidgetShell";
import { openPost } from "@/shared/views/modal-host";
import type { MapPoint } from "@/shared/views/MapView";

const MapView = lazy(() => import("@/shared/views/MapView"));

interface Place { uuid: string; label: string; coord: string; created: string }

async function fetchPlaces(nick: string): Promise<Place[]> {
  const res = await apiFetch(`/spa/channel/${encodeURIComponent(nick)}/places`);
  if (!res.ok) throw new Error(`places ${res.status}`);
  return (await res.json()).data as Place[];
}

export default function ChannelPlacesWidget() {
  const { t } = useI18n();
  const nick = usePageNick();
  const enabled = useMapsEnabled();
  const [data] = createAsyncResource("channel-places", () => (enabled() && nick()) || null, fetchPlaces);

  const points = (): MapPoint[] =>
    (data() ?? []).flatMap((p) => {
      const c = parseCoord(p.coord);
      return c ? [{ ...c, label: p.label, onClick: () => void openPost(p.uuid) }] : [];
    });

  return (
    <AsyncBoundary quiet><Show when={enabled() && data()}>
      <WidgetShell title={t("widgets.channel_places")}>
<div class="px-(--ws-px) py-3">
        <Show when={points().length} fallback={<p class="text-xs text-muted">{t("widgets.channel_places_empty")}</p>}>
          <Loading>
            <MapView points={points()} class="h-64" />
          </Loading>
        </Show>
      </div>
</WidgetShell>
    </Show></AsyncBoundary>
  );
}
