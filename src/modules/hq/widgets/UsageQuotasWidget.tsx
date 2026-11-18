// Account resource usage at a glance — storage, channels, connections, and
// other service-class quotas, backed by the same GET /spa/settings/account
// data the full Account settings page renders (a 403/empty response there
// just means the widget renders nothing).

import { For, Show } from "solid-js";
import { fetchAccountSettings } from "@/modules/settings/api/api";
import type { AccountQuota } from "@/modules/settings/store/types";
import { formatQuotaValue, quotaPercent } from "@/shared/lib/quota-format";
import { useI18n } from "@utsukta/spa-core/i18n";
import { WidgetShell } from "@ui/WidgetShell";
import { useAsyncQuery } from "@utsukta/spa-core/lib/query";
import AsyncBoundary from "@/shared/views/AsyncBoundary";

export default function UsageQuotasWidget() {
  const { t } = useI18n();
  const q = useAsyncQuery(() => ({ queryKey: ["hq-usage-quotas"], queryFn: fetchAccountSettings }));

  // Only the quotas with a running total can render as a bar — limit-only
  // values (a floor, or a per-room concurrent count) have nothing to fill;
  // they still show up in full on the Account settings page.
  const quotas = () => (q.data.quotas ?? []).filter((x) => quotaPercent(x) !== null);

  return (
    <AsyncBoundary quiet>
    <Show when={quotas().length > 0}>
      <WidgetShell title={t("widgets.usage_quotas")}>
<div class="px-(--ws-px) py-3" data-tour="hq.quotas">

        <div class="space-y-2">
          <For each={quotas()}>{(q) => <QuotaTile quota={q} />}</For>
        </div>

        <a
          href="/settings/account"
          class="block text-xs text-accent hover:underline mt-3"
        >
          {t("widgets.usage_quotas_view_all")}
        </a>
      </div>
</WidgetShell>
    </Show>
    </AsyncBoundary>
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
          class={["h-full rounded-full bg-accent transition-all", { "bg-danger": pct() >= 90 }]}
          style={{ width: `${pct()}%` }}
        />
      </div>
    </div>
  );
}
