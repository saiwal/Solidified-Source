import { For, Show } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAccountSettings } from "../../api/api";
import { useSectionForm } from "../../store/useSectionForm";
import type { AccountQuota } from "../../store/types";
import { formatQuotaValue, quotaPercent } from "@/shared/lib/quota-format";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Field, Input } from "@ui/Field";

export default function AccountSection() {
  const { t } = useI18n();
  const { data, saving, handleSubmit } = useSectionForm({
    section: "account",
    fetcher: fetchAccountSettings,
    saver: async () => {}, // account email change not yet wired in PHP
  });

  return (
    <SubPageContent title={t("settings.title_account")} description={t("settings.desc_account")}>
      <Show when={data()} fallback={<Skeleton />}>
        <form onSubmit={handleSubmit} class="space-y-6">
          <Field label={t("settings.email")}>
            <Input class="w-full max-w-sm" type="email" name="email" value={data()!.$email} />
          </Field>

          <div class="flex items-center gap-3 pt-2">
            <Button variant="primary" type="submit" disabled={saving()}>
              {saving() ? t("settings.saving") : t("settings.save")}
            </Button>
          </div>
        </form>

        <Show when={data()!.quotas.length > 0}>
          <div class="space-y-3 pt-2 border-t border-rim">
            <h3 class="text-sm font-semibold text-txt pt-4">{t("settings.quotas_title")}</h3>
            <p class="text-xs text-muted -mt-2">{t("settings.quotas_desc")}</p>
            <div class="space-y-3">
              <For each={data()!.quotas}>
                {(q) => <QuotaRow quota={q} />}
              </For>
            </div>
          </div>
        </Show>
      </Show>
    </SubPageContent>
  );
}

function QuotaRow(props: { quota: AccountQuota }) {
  const { t } = useI18n();
  const label = () => t(`settings.quota_${props.quota.key}` as any);
  const pct = () => quotaPercent(props.quota);

  return (
    <div class="space-y-1">
      <div class="flex items-center justify-between text-xs">
        <span class="text-txt">{label()}</span>
        <span class="text-muted">
          <Show
            when={props.quota.usage !== null}
            fallback={formatQuotaValue(props.quota.key, props.quota.limit)}
          >
            {formatQuotaValue(props.quota.key, props.quota.usage!)} / {formatQuotaValue(props.quota.key, props.quota.limit)}
          </Show>
        </span>
      </div>
      <Show when={pct() !== null}>
        <div class="h-1.5 rounded-full bg-elevated overflow-hidden">
          <div
            class="h-full rounded-full bg-accent transition-all"
            classList={{ "bg-danger": (pct() ?? 0) >= 90 }}
            style={{ width: `${pct()}%` }}
          />
        </div>
      </Show>
    </div>
  );
}


function Skeleton() {
  return (
    <div class="space-y-5 animate-pulse">
      <div class="h-3.5 w-32 rounded bg-elevated" />
      <div class="h-9 w-64 rounded-lg bg-elevated" />
    </div>
  );
}
