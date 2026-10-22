// Account resource usage at a glance — storage, channels, connections, and
// other service-class quotas, backed by the same GET /spa/settings/account
// data the full Account settings page renders (a 403/empty response there
// just means the widget renders nothing).

import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchAccountSettings } from "@/modules/settings/api/api";
import type { AccountQuota } from "@/modules/settings/store/types";
import { formatQuotaValue, quotaPercent } from "@/shared/lib/quota-format";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

export default function UsageQuotasWidget() {
  const { t } = useI18n();
  const [settings] = createQueryResource("hq-usage-quotas", fetchAccountSettings);

  // Only the quotas with a running total can render as a bar — limit-only
  // values (a floor, or a per-room concurrent count) have nothing to fill;
  // they still show up in full on the Account settings page.
  const quotas = () => (settings()?.quotas ?? []).filter((q) => quotaPercent(q) !== null);

  return (
    <Show when={!settings.loading && quotas().length > 0}>
      <Card class="p-4" data-tour="hq.quotas">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
          {t("widgets.usage_quotas")}
        </h3>

        <div class="space-y-2">
          <For each={quotas()}>{(q) => <QuotaTile quota={q} />}</For>
        </div>

        <A
          href="/settings/account"
          class="block text-xs text-accent hover:underline mt-3"
        >
          {t("widgets.usage_quotas_view_all")}
        </A>
      </Card>
    </Show>
  );
}

function QuotaTile(props: { quota: AccountQuota }) {
  const { t } = useI18n();
  const label = () => t(`settings.quota_${props.quota.key}` as any);
  const pct = () => quotaPercent(props.quota) ?? 0;
  const title = () =>
    `${label()}: ${formatQuotaValue(props.quota.key, props.quota.usage!)} / ${formatQuotaValue(props.quota.key, props.quota.limit)}`;

  return (
    <div class="flex items-center gap-2 text-xs" title={title()}>
      <span class="text-txt truncate shrink-0 max-w-[40%]">{label()}</span>
      <div class="flex-1 min-w-0 h-1.5 rounded-full bg-elevated overflow-hidden">
        <div
          class="h-full rounded-full bg-accent transition-all"
          classList={{ "bg-danger": pct() >= 90 }}
          style={{ width: `${pct()}%` }}
        />
      </div>
    </div>
  );
}
