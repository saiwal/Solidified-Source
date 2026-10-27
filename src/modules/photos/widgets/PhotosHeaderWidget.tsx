import { useLocation, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { albums, tab, switchTab, type PhotoTab } from "../store/store";
import { useMapsEnabled } from "@utsukta/spa-core/lib/useOsmMap";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { Tabs } from "@ui/Tabs";

export default function PhotosHeaderWidget() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const nick     = usePageNick();
  const owner    = usePageOwnerName();
  const mapsOn   = useMapsEnabled();

  // The tabs stay visible inside an album or a single image (those are their
  // own routes, see PhotosContentWidget's datatype()) — picking one there
  // navigates back to the summary rather than leaving the tab inert.
  const isSummary = () => !/\/(album|image)(\/|$)/.test(location.pathname);

  function pick(id: PhotoTab) {
    switchTab(id);
    if (!isSummary()) navigate(`/photos/${nick() ?? ""}`);
  }

  // The uploads tab only exists if the channel actually has automatic
  // upload folders (pconfig system/photo_path) — `auto` comes from the API.
  const hasAuto = () => albums().some((a) => a.auto);

  const tabs = () => [
    { id: "photos" as const, label: t("photos.tab_photos"), show: true },
    { id: "albums" as const, label: t("photos.tab_albums"), show: true },
    { id: "uploads" as const, label: t("photos.tab_uploads"), show: hasAuto() },
    { id: "map" as const, label: t("photos.tab_map"), show: mapsOn() },
  ].filter((s) => s.show);

  return (
    <div class="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
      <h1 class="text-lg font-semibold text-txt">
        {owner() === null ? t("photos.title_mine") : t("photos.title_of", { name: owner()! })}
      </h1>

      <Tabs
        label={t("nav.photos")}
        class="mx-auto"
        value={tab()}
        onChange={pick}
        items={tabs().map((s) => ({ value: s.id, label: s.label }))}
      />
    </div>
  );
}
