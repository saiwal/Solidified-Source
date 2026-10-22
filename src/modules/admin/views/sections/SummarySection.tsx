import { For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminSummary } from "../../api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";

export default function SummarySection() {
  const { t } = useI18n();
  const [data] = createQueryResource("admin-summary", fetchAdminSummary);

  return (
    <SubPageContent title={t("admin.summary_title")} description={t("admin.summary_desc")}>
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <div class="space-y-6">
            <StatGrid
              label={t("admin.accounts_title")}
              stats={[
                { label: t("admin.stat_total"), value: d().accounts.total },
                { label: t("admin.stat_blocked"), value: d().accounts.blocked },
                { label: t("admin.stat_expired"), value: d().accounts.expired },
                { label: t("admin.stat_expiring"), value: d().accounts.expiring },
              ]}
            />

            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label={t("admin.stat_channels")} value={d().channels} />
              <Stat label={t("admin.stat_pending")} value={d().pending} />
              <Stat label={t("admin.stat_queue")} value={d().queue} accent={d().queue > 0} />
            </div>

            <div class="space-y-1.5">
              <p class="text-sm font-medium text-txt">{t("admin.version_label")}</p>
              <p class="text-sm text-muted font-mono">{d().version}</p>
            </div>

            <Show when={d().plugins.length > 0}>
              <div class="space-y-1.5">
                <p class="text-sm font-medium text-txt">{t("admin.active_plugins")} ({d().plugins.length})</p>
                <div class="flex flex-wrap gap-1.5">
                  <For each={d().plugins}>
                    {(p) => (
                      <Badge>
                        {p}
                      </Badge>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

function StatGrid(props: { label: string; stats: { label: string; value: number }[] }) {
  return (
    <div class="space-y-2">
      <p class="text-sm font-medium text-txt">{props.label}</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <For each={props.stats}>{(s) => <Stat label={s.label} value={s.value} />}</For>
      </div>
    </div>
  );
}

function Stat(props: { label: string; value: number; accent?: boolean }) {
  return (
    <Card class="p-3 space-y-0.5">
      <p class={`text-lg font-semibold ${props.accent ? "text-accent" : "text-txt"}`}>
        {props.value.toLocaleString()}
      </p>
      <p class="text-xs text-muted">{props.label}</p>
    </Card>
  );
}

function Skeleton() {
  return (
    <div class="space-y-4 animate-pulse">
      <div class="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }, () => (
          <div class="h-16 rounded-lg bg-elevated" />
        ))}
      </div>
      <div class="h-4 w-48 rounded bg-elevated" />
      <div class="h-4 w-32 rounded bg-elevated" />
    </div>
  );
}
