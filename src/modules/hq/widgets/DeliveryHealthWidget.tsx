/**
 * DeliveryHealthWidget.tsx
 * How your recent outgoing deliveries fared (dreport — core keeps ~10 days)
 * and which sites keep failing. Hidden until there's something to report.
 */
import { For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

interface Health {
  ok: number; pending: number; failed: number; total: number; oldest: string | null;
  sites: { site: string; failed: number; last_result: string; last_time: string }[];
}

async function fetchHealth(): Promise<Health> {
  const res = await apiFetch("/spa/delivery");
  if (!res.ok) throw new Error(`delivery ${res.status}`);
  return (await res.json()).data as Health;
}

export default function DeliveryHealthWidget() {
  const { t } = useI18n();
  const [health] = createQueryResource("delivery-health", fetchHealth);
  const pct = () => {
    const h = health()!;
    const settled = h.ok + h.failed;
    return settled ? Math.round((h.ok / settled) * 100) : 100;
  };

  return (
    <Show when={health()?.total}>
      <Card class="p-4">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          {t("widgets.delivery_health")}
        </h3>
        <p class="text-sm text-txt">
          {t("widgets.delivery_summary", { pct: pct(), total: health()!.total })}
        </p>
        <Show
          when={health()!.sites.length}
          fallback={<p class="text-xs text-success-txt mt-1">{t("widgets.delivery_all_ok")}</p>}
        >
          <p class="text-xs text-muted mt-3 mb-1">{t("widgets.delivery_failing")}</p>
          <ul class="space-y-1">
            <For each={health()!.sites}>
              {(s) => (
                <li class="flex items-baseline gap-2 text-xs" title={s.last_result}>
                  <span class="truncate flex-1 text-txt">{s.site}</span>
                  <span class="shrink-0 tabular-nums text-danger-txt">{s.failed}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Card>
    </Show>
  );
}
