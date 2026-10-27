/**
 * PhotoMap.tsx
 * The photos "Map" tab: every geotagged photo as a thumbnail pin, click to
 * open it. NSFW photos get a plain dot rather than their thumbnail.
 */
import { lazy, Show, Suspense } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { MdOutlineMap } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { parseCoord } from "@utsukta/spa-core/lib/osm";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { EmptyState } from "@ui/EmptyState";
import { Spinner } from "@ui/Spinner";
import type { MapPoint } from "@/shared/views/MapView";
import { fetchPhotoPins, variantSrc } from "../api/api";

const MapView = lazy(() => import("@/shared/views/MapView"));

export default function PhotoMap(props: { nick: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const role = useViewerRole();
  const [pins] = createQueryResource("photo-pins", () => props.nick || null, fetchPhotoPins);

  const points = (): MapPoint[] =>
    (pins() ?? []).flatMap((p) => {
      const c = parseCoord(p.coord);
      if (!c) return [];
      return [{
        ...c,
        label: p.title,
        thumb: p.is_nsfw ? undefined : variantSrc(p.src, 3),
        onClick: () => navigate(`/photos/${props.nick}/image/${p.resource_id}`),
      }];
    });

  return (
    <Show when={!pins.loading} fallback={<div class="flex justify-center py-12"><Spinner /></div>}>
      <Show
        when={points().length}
        fallback={
          <EmptyState size="md" icon={<MdOutlineMap />}>
            <p>{t("photos.map_empty")}</p>
            <Show when={role() === "owner"}>
              <p class="text-sm mt-2 max-w-md mx-auto">{t("photos.map_empty_owner")}</p>
            </Show>
          </EmptyState>
        }
      >
        <Suspense fallback={<div class="flex justify-center py-12"><Spinner /></div>}>
          <MapView points={points()} />
        </Suspense>
      </Show>
    </Show>
  );
}
