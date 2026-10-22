import { Show } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminSecurity, saveAdminSecurity } from "../../api";
import { useSectionForm } from "@/modules/settings/store/useSectionForm";
import type { AdminSecurity } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Field, Textarea } from "@ui/Field";
import { Toggle } from "@ui/Toggle";

export default function SecuritySection() {
  const { t } = useI18n();
  const { data, saving, handleSubmit } = useSectionForm<AdminSecurity>({
    section: "admin-security",
    fetcher: fetchAdminSecurity,
    saver: saveAdminSecurity,
    checkboxFields: [
      "block_public", "cloud_disable_siteroot", "cloud_report_disksize",
      "embed_sslonly", "transport_security_header", "content_security_policy",
    ],
  });

  return (
    <SubPageContent
      title={t("admin.security_title")}
      description={t("admin.security_desc")}
      action={
        <Show when={data()}>
          <Button form="security-form" type="submit" disabled={saving()}>
            {saving() ? t("admin.saving") : t("admin.save")}
          </Button>
        </Show>
      }
    >
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <form id="security-form" onSubmit={handleSubmit} class="space-y-5">
            <Toggle name="block_public" label="Block public access" checked={d().block_public}
              hint="Require authentication to view any public personal pages." />
            <Toggle name="cloud_disable_siteroot" label="Provide cloud root directory" checked={!d().cloud_disable_siteroot}
              hint="List all channels that have public files." />
            <Toggle name="cloud_report_disksize" label="Show total disk space in cloud" checked={d().cloud_report_disksize} />

            <hr class="border-rim" />

            <Field label="Allowed email domains" hint="Comma-separated. Only these domains may register.">
              <Textarea class="w-full" name="allowed_email" rows={2}>{d().allowed_email}</Textarea>
            </Field>
            <Field label="Blocked email domains" hint="Comma-separated. These domains are denied.">
              <Textarea class="w-full" name="not_allowed_email" rows={2}>{d().not_allowed_email}</Textarea>
            </Field>

            <hr class="border-rim" />

            <Field label="Allowed sites (federation whitelist)" hint="One URL per line.">
              <Textarea class="w-full" name="whitelisted_sites" rows={3}>{d().whitelisted_sites}</Textarea>
            </Field>
            <Field label="Blocked sites (federation blacklist)" hint="One URL per line.">
              <Textarea class="w-full" name="blacklisted_sites" rows={3}>{d().blacklisted_sites}</Textarea>
            </Field>
            <Field label="Allowed channels">
              <Textarea class="w-full" name="whitelisted_channels" rows={2}>{d().whitelisted_channels}</Textarea>
            </Field>
            <Field label="Blocked channels">
              <Textarea class="w-full" name="blacklisted_channels" rows={2}>{d().blacklisted_channels}</Textarea>
            </Field>

            <hr class="border-rim" />

            <Toggle name="embed_sslonly" label="Only allow HTTPS embeds" checked={d().embed_sslonly} />
            <Field label="Allowed embed domains" hint="One URL per line — allow unfiltered HTML from these.">
              <Textarea class="w-full" name="embed_allow" rows={3}>{d().embed_allow}</Textarea>
            </Field>
            <Field label="Blocked embed domains">
              <Textarea class="w-full" name="embed_deny" rows={2}>{d().embed_deny}</Textarea>
            </Field>

            <hr class="border-rim" />

            <Toggle name="transport_security_header" label="Send Transport Security header (HSTS)" checked={d().transport_security_header} />
            <Toggle name="content_security_policy" label="Send Content Security Policy header" checked={d().content_security_policy} />

            <Field label="Trusted directory servers" hint="One URL per line.">
              <Textarea class="w-full" name="trusted_directory_servers" rows={2}>{d().trusted_directory_servers}</Textarea>
            </Field>

          </form>
        )}
      </Show>
    </SubPageContent>
  );
}



function Skeleton() {
  return (
    <div class="space-y-4 animate-pulse">
      {Array.from({ length: 6 }, () => (
        <div class="space-y-1.5">
          <div class="h-3.5 w-32 rounded bg-elevated" />
          <div class="h-9 w-full rounded-lg bg-elevated" />
        </div>
      ))}
    </div>
  );
}
