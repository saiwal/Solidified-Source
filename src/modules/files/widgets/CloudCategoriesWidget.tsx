// src/modules/files/widgets/CloudCategoriesWidget.tsx
import { useLocation, useNavigate, useSearchParams } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import CategoryWidget from "@/shared/stream/components/CategoryWidget";
import { listCategoryCounts } from "../api";

/** Categories used in this cloud. A click toggles `?cat=` on the open folder's
 *  URL, which FilesContentWidget reads to narrow its listing to that subtree. */
export default function CloudCategoriesWidget() {
  const { t } = useI18n();
  const nick = usePageNick();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [cats] = createQueryResource(
    "files-categories",
    () => nick() || null,
    (n) => listCategoryCounts(n),
  );

  const active = () => (typeof params.cat === "string" ? params.cat : undefined);

  function toggle(name: string) {
    // Off /cloud (widget placed elsewhere) start from the cloud root.
    const base = location.pathname.startsWith("/cloud") ? location.pathname : `/cloud/${nick()}`;
    navigate(active() === name ? base : `${base}?cat=${encodeURIComponent(name)}`);
  }

  return (
    <CategoryWidget
      title={t("widgets.cloud_categories") as string}
      data={(cats() ?? []).map((c) => ({ ...c, slug: c.name }))}
      activeSlug={active()}
      onCategoryClick={toggle}
    />
  );
}
