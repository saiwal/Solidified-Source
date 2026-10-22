import { Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { cartCount, tab, switchTab } from "../store";
import { Tabs } from "@ui/Tabs";

export default function CartHeaderWidget() {
  const { t } = useI18n();
  const viewerRole = useViewerRole();
  const isOwner = () => viewerRole() === "owner";

  const tabs = [
    { id: "catalog" as const, label: () => t("cart.catalog_tab") },
    { id: "cart" as const, label: () => t("cart.cart_tab") },
  ];

  return (
    <div class="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
      <h1 class="text-lg font-semibold text-txt">{t("nav.cart")}</h1>

      <Tabs
        label={t("nav.cart")}
        class="mx-auto"
        value={tab()}
        onChange={switchTab}
        items={[
          ...tabs.map((s) => ({
            value: s.id,
            label: <>{s.label()}<Show when={s.id === "cart" && cartCount() > 0}>{" "}({cartCount()})</Show></>,
          })),
          ...(isOwner() ? [{ value: "orders" as const, label: t("cart.orders_tab") }] : []),
        ]}
      />
    </div>
  );
}
