import { For } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { albums, tab, switchTab } from "../store/store";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

export default function PhotosHeaderWidget() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const nick     = usePageNick();

  // The tabs stay visible inside an album or a single image (those are their
  // own routes, see PhotosContentWidget's datatype()) — picking one there
  // navigates back to the summary rather than leaving the tab inert.
  const isSummary = () => !/\/(album|image)(\/|$)/.test(location.pathname);

  function pick(id: "photos" | "albums" | "uploads") {
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
  ].filter((s) => s.show);

  return (
    <div class="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
      <h1 class="text-lg font-semibold text-txt">{t("nav.photos")}</h1>

      <div class="flex gap-1 p-1 bg-elevated rounded-lg w-fit mx-auto">
        <For each={tabs()}>{(s) => (
          <button
            onClick={() => pick(s.id)}
            class={`px-3 text-center text-xs py-1 rounded-md transition-colors font-medium
              ${tab() === s.id
                ? "bg-accent text-accent-fg font-semibold"
                : "text-muted hover:text-txt"}`}
          >
            {s.label}
          </button>
        )}</For>
      </div>
    </div>
  );
}
