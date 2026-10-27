import { For, Show } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAccountSettings } from "../../api/api";
import { useSectionForm } from "../../store/useSectionForm";
import { SaveBar } from "../../store/FormHelpers";
import type { AccountQuota, AccountSettings } from "../../store/types";
import { formatQuotaValue, humanBytes, quotaPercent } from "@/shared/lib/quota-format";
import { A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
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

          <SaveBar saving={saving()} />
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

        <Show when={data()!.storage?.types.length}>
          <StorageBreakdown storage={data()!.storage!} />
        </Show>
      </Show>
    </SubPageContent>
  );
}

function StorageBreakdown(props: { storage: NonNullable<AccountSettings["storage"]> }) {
  const { t } = useI18n();
  const total = () => props.storage.types.reduce((n, x) => n + x.bytes, 0) || 1;
  return (
    <div class="space-y-3 pt-2 border-t border-rim mt-6">
      <h3 class="text-sm font-semibold text-txt pt-4">{t("settings.storage_title")}</h3>
      {/* One stacked bar; opacity steps of the accent keep it on theme */}
      <div class="flex h-2 rounded-full overflow-hidden bg-elevated" aria-hidden="true">
        <For each={props.storage.types}>
          {(x, i) => <div class="h-full bg-accent" style={{ width: `${(x.bytes / total()) * 100}%`, opacity: 1 - i() * 0.18 }} />}
        </For>
      </div>
      <ul class="space-y-1 text-sm">
        <For each={props.storage.types}>
          {(x, i) => (
            <li class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-sm bg-accent shrink-0" style={{ opacity: 1 - i() * 0.18 }} />
              <span class="flex-1 text-txt">{t(`settings.storage_${x.kind}` as any)}</span>
              <span class="text-xs text-muted tabular-nums">{t("settings.storage_files", { n: x.files })}</span>
              <span class="w-20 text-right tabular-nums text-txt">{humanBytes(x.bytes)}</span>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.storage.largest.length}>
        <p class="text-xs text-muted pt-2">{t("settings.storage_largest")}</p>
        <ul class="space-y-1 text-sm">
          <For each={props.storage.largest}>
            {(f) => (
              <li class="flex items-center gap-2 min-w-0">
                <A href={f.href} class="flex-1 truncate text-accent-txt hover:underline">{f.name}</A>
                <span class="w-20 text-right tabular-nums text-muted shrink-0">{humanBytes(f.bytes)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
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
