import { Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useNavData } from "@utsukta/spa-core/store/nav-store";
import { useSiteinfo, RegistrationBadge, Centered } from "./shared";
import { Card } from "@ui/Card";

export default function SiteinfoHeaderWidget() {
  const { t } = useI18n();
  const info = useSiteinfo();
  const navData = useNavData();

  return (
    <Centered>
      <Show when={!info.loading} fallback={<HeaderSkeleton />}>
        <Show when={info()} fallback={<p class="text-sm text-accent">{t("ui.siteinfo_load_failed")}</p>}>
          {(data) => (
            <Card class="p-6">
              <div class="flex items-start gap-4">
                <img
                  src={navData()?.sitelogo || import.meta.env.BASE_URL + "hubzilla.svg"}
                  alt=""
                  aria-hidden="true"
                  class="h-20 w-20 shrink-0 rounded object-contain me-4"
                />
                <div class="min-w-0">
                  <h1 class="text-xl font-bold text-txt truncate">
                    {data().site_name}
                  </h1>
                  <div class="mt-2">
                    <RegistrationBadge policy={data().registration} />
                  </div>
                </div>
              </div>
            </Card>
          )}
        </Show>
      </Show>
    </Centered>
  );
}

function HeaderSkeleton() {
  return (
    <div class="rounded-xl border border-rim bg-surface p-6 animate-pulse">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl bg-overlay shrink-0" />
        <div class="space-y-2 flex-1">
          <div class="h-5 w-48 rounded bg-overlay" />
          <div class="h-3 w-16 rounded bg-overlay" />
          <div class="h-5 w-24 rounded-md bg-overlay" />
        </div>
      </div>
    </div>
  );
}
