import { createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useQueryClient } from "@utsukta/spa-core/lib/query";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { SaveBar } from "@/modules/settings/store/FormHelpers";
import { fetchAdminSite, saveAdminSite, fetchAdminThemes, uploadSiteLogo, removeSiteLogo } from "../../api";
import { useSectionForm } from "@/modules/settings/store/useSectionForm";
import type { AdminSite } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { Button } from "@ui/Button";
import { Field, Input, Select, Textarea } from "@ui/Field";
import { Toggle } from "@ui/Toggle";
import { Card } from "@ui/Card";

const REGISTER_POLICIES = [
  { value: 0, label: "Closed – no new registrations" },
  { value: 1, label: "Open with approval" },
  { value: 2, label: "Open" },
];

const ACCESS_POLICIES = [
  { value: 0, label: "Not a public server" },
  { value: 1, label: "Paid access only" },
  { value: 2, label: "Free access only" },
  { value: 3, label: "Free + optional paid upgrades" },
];

const DIRECTORY_MODES: Record<number, string> = {
  1: "primary", 2: "secondary", 256: "standalone",
};

// Keep a configured URL selectable even if it has dropped out of the site table,
// so opening this form and saving can't silently repoint the hub.
const dirChoices = (d: AdminSite) =>
  d.directory_server && !d.directory_server_choices?.includes(d.directory_server)
    ? [d.directory_server, ...(d.directory_server_choices ?? [])]
    : (d.directory_server_choices ?? []);

const PERMISSION_ROLES = [
  { value: "personal", label: "Personal" },
  { value: "public",   label: "Public" },
  { value: "group",    label: "Community forum" },
  { value: "custom",   label: "Custom" },
];

export default function SiteSection() {
  const { t } = useI18n();
  const [themes] = createQueryResource("admin-themes", fetchAdminThemes);

  const { data, saving, handleSubmit } = useSectionForm<AdminSite>({
    section: "admin-site",
    fetcher: fetchAdminSite,
    saver: saveAdminSite,
    numericFields: [
      "register_policy", "access_policy", "max_daily_registrations",
      "minimum_age", "register_sameip", "abandon_days", "maximagesize",
      "curl_timeout", "delivery_interval", "delivery_batch_count",
      "poll_interval", "maxloadavg", "default_expire_days", "active_expire_days",
    ],
    checkboxFields: [
      "login_on_homepage", "disable_discover_tab", "site_firehose", "open_pubstream",
      "publish_all", "no_community_page", "mirror_frontpage",
      "verify_email", "register_wo_email", "auto_channel_create",
      "invitation_only", "invitation_also",
      "enable_context_help", "sse_enabled", "feed_contacts", "verifyssl",
    ],
  });

  return (
    <SubPageContent
      title={t("admin.site_title")}
      description={t("admin.site_desc")}
    >
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <form id="site-form" onSubmit={handleSubmit} class="space-y-5">

            {/* ── Basic Identity ── */}
            <SectionHeading>Basic</SectionHeading>
            <Field label="Site name">
              <Input class="w-full" name="sitename" value={d().sitename ?? ''} />
            </Field>
            <Field label="Site location" hint="Region or country">
              <Input class="w-full" name="site_location" value={d().site_location ?? ''} />
            </Field>
            <Field label="Banner / logo" hint="Unfiltered HTML/CSS/JS is allowed">
              <Input class="w-full" name="banner" value={d().banner ?? ''} />
            </Field>
            <Field
              label="Site logo"
              hint="Used as the browser favicon, PWA icon, and in the app nav. Square images work best — non-square images are center-cropped, not stretched. At least 512x512 px recommended; max 4000x4000 px."
            >
              <SiteLogoField site={d()} />
            </Field>
            <Field label="Admin info" hint="Shown on siteinfo page. BBCode accepted.">
              <Textarea class="w-full" name="admininfo" rows={3}>{d().admininfo ?? ''}</Textarea>
            </Field>
            <Field label="Site info" hint="Public description. BBCode accepted.">
              <Textarea class="w-full" name="siteinfo" rows={3}>{d().siteinfo ?? ''}</Textarea>
            </Field>
            <Field label="System language" hint="Language code, e.g. 'en', 'de', 'fr'">
              <Input class="w-full" name="language" value={d().language ?? 'en'} />
            </Field>
            <Field label="Default theme" hint="Users may override this in their own profile.">
              <div class="flex gap-2 items-center">
                <Select class="w-full flex-1" name="theme">
                  <Show
                    when={themes()?.themes?.length}
                    fallback={
                      <option value={d().theme ?? 'redbasic'}>{d().theme ?? 'redbasic'}</option>
                    }
                  >
                    {themes()!.themes.map((th) => (
                      <option
                        value={th.name}
                        selected={(d().theme ?? 'redbasic') === th.name}
                        disabled={!th.compatible}
                      >
                        {th.name}
                        {th.experimental ? " (experimental)" : ""}
                        {!th.compatible ? " (incompatible)" : ""}
                      </option>
                    ))}
                  </Show>
                </Select>
                <A
                  href="/admin/themes"
                  class="shrink-0 px-3 py-2 text-sm rounded-lg border border-rim
                         text-muted hover:text-txt hover:bg-elevated transition-colors"
                >
                  Configure
                </A>
              </div>
            </Field>
            <Field label="Default permission role for new accounts">
              <Select class="w-full" name="default_permissions_role">
                {PERMISSION_ROLES.map((r) => (
                  <option value={r.value} selected={(d().default_permissions_role ?? 'personal') === r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>

            <hr class="border-rim" />

            {/* ── Registration ── */}
            <SectionHeading>Registration</SectionHeading>
            <Field label="Registration policy">
              <Select class="w-full" name="register_policy">
                {REGISTER_POLICIES.map((p) => (
                  <option value={p.value} selected={(d().register_policy ?? 0) === p.value}>{p.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Registration page text" hint="Shown prominently on the registration form">
              <Textarea class="w-full" name="register_text" rows={3}>{d().register_text ?? ''}</Textarea>
            </Field>
            <Field label="Max daily registrations" hint="0 = unlimited (default 50)">
              <Input
                class="w-full"
                type="number"
                name="max_daily_registrations"
                value={d().max_daily_registrations ?? 50}
                min={0}
              />
            </Field>
            <Field label="Max registrations from same IP" hint="0 = unlimited (default 3)">
              <Input
                class="w-full"
                type="number"
                name="register_sameip"
                value={d().register_sameip ?? 3}
                min={0}
              />
            </Field>
            <Field label="Minimum age" hint="Minimum age in years for registration (default 13)">
              <Input class="w-full" type="number" name="minimum_age" value={d().minimum_age ?? 13} min={0} />
            </Field>
            <Field label="Abandon account after (days)" hint="0 = no limit. Stops polling external sites for abandoned accounts.">
              <Input class="w-full" type="number" name="abandon_days" value={d().abandon_days ?? 0} min={0} />
            </Field>
            <Toggle name="verify_email" label="Require email address verification" checked={d().verify_email ?? false} />
            <Toggle name="register_wo_email" label="Allow registration without email" checked={d().register_wo_email ?? false} />
            <Toggle name="auto_channel_create" label="Auto-create channel on registration" checked={d().auto_channel_create ?? true} />
            <Toggle name="invitation_only" label="Require invite code to register" checked={d().invitation_only ?? false} />
            <Toggle name="invitation_also" label="Allow (but not require) invite code" checked={d().invitation_also ?? false} />

            <hr class="border-rim" />

            {/* ── Access Policy ── */}
            <SectionHeading>Access</SectionHeading>
            <Field label="Which best describes the types of account offered by this hub?" hint="This is displayed on the public server site list.">
              <Select class="w-full" name="access_policy">
                {ACCESS_POLICIES.map((p) => (
                  <option value={p.value} selected={(d().access_policy ?? 2) === p.value}>{p.label}</option>
                ))}
              </Select>
            </Field>

            <hr class="border-rim" />

            {/* ── Visibility & Streams ── */}
            <SectionHeading>Visibility &amp; streams</SectionHeading>
            <Toggle name="login_on_homepage" label="Show login box on homepage" checked={d().login_on_homepage ?? false} />
            <Toggle name="disable_discover_tab" label="Disable discover tab" checked={d().disable_discover_tab ?? true} />
            <Toggle name="site_firehose" label="Site-only public stream (firehose)" checked={d().site_firehose ?? false} />
            <Toggle name="open_pubstream" label="Allow unauthenticated access to public stream" checked={d().open_pubstream ?? false} />
            <Toggle name="publish_all" label="Force-publish all profiles to site directory" checked={d().publish_all ?? false} />
            <Toggle name="no_community_page" label="Hide community page" checked={d().no_community_page ?? false} />

            <Field label="Visitor homepage" hint="e.g. 'pubstream', 'page/sys/home', 'include:home.html'. Leave blank for default login box.">
              <Input class="w-full" name="frontpage" value={d().frontpage ?? ''} />
            </Field>
            <Toggle name="mirror_frontpage" label="Present homepage in frame (don't redirect)" checked={d().mirror_frontpage ?? false} />
            <Field label="Landing page for new registrants" hint="URL of a marketing/sell page. Default: /register">
              <Input class="w-full" name="site_sellpage" value={d().site_sellpage ?? ''} />
            </Field>
            <Field label="Page shown after channel creation" hint="e.g. 'profiles' (default)">
              <Input class="w-full" name="first_page" value={d().first_page ?? 'profiles'} />
            </Field>
            <Field label="Allowed friend domains" hint="Comma-separated. Wildcards OK. Empty = allow all.">
              <Input class="w-full" name="allowed_sites" value={d().allowed_sites ?? ''} />
            </Field>

            <hr class="border-rim" />

            {/* ── Public Stream Filters ── */}
            <SectionHeading>Public stream filters</SectionHeading>
            <Field label="Include only posts matching" hint="Words, #tags, /patterns/, or lang=xx — one per line. Leave blank to import all.">
              <Textarea class="w-full" name="pubstream_incl" rows={3}>{d().pubstream_incl ?? ''}</Textarea>
            </Field>
            <Field label="Exclude posts matching" hint="Same syntax as above.">
              <Textarea class="w-full" name="pubstream_excl" rows={3}>{d().pubstream_excl ?? ''}</Textarea>
            </Field>

            <hr class="border-rim" />

            {/* ── Directory ── */}
            <SectionHeading>Directory</SectionHeading>
            <Show
              when={d().directory_mode === 0}
              fallback={
                <p class="text-sm text-muted">
                  This hub runs its own directory ({DIRECTORY_MODES[d().directory_mode] ?? d().directory_mode},
                  realm {d().directory_realm}), so no upstream directory server is used.
                </p>
              }
            >
              <Field label="Directory server" hint={`Realm: ${d().directory_realm}`}>
                <Select class="w-full" name="directory_server">
                  <For each={dirChoices(d())}>
                    {(url) => (
                      <option value={url} selected={d().directory_server === url}>{url}</option>
                    )}
                  </For>
                </Select>
              </Field>
            </Show>

            <hr class="border-rim" />

            {/* ── Email ── */}
            <SectionHeading>Email</SectionHeading>
            <Field label="Sender (From) email address for system generated email.">
              <Input class="w-full" type="email" name="from_email" value={d().from_email ?? ''} />
            </Field>
            <Field label="Name of email sender for system generated email.">
              <Input class="w-full" name="from_email_name" value={d().from_email_name ?? ''} />
            </Field>
            <Field label="Reply-to email address for system generated email.">
              <Input class="w-full" type="email" name="reply_address" value={d().reply_address ?? ''} />
            </Field>

            <hr class="border-rim" />

            {/* ── Behavior ── */}
            <SectionHeading>Behavior</SectionHeading>
            <Toggle name="enable_context_help" label="Enable context help" checked={d().enable_context_help ?? false} />
            <Toggle name="sse_enabled" label="Enable SSE notifications (vs polling)" checked={d().sse_enabled ?? false} />
            <Toggle name="feed_contacts" label="Allow feeds as connections" checked={d().feed_contacts ?? false} />

            <hr class="border-rim" />

            {/* ── Upload limits ── */}
            <SectionHeading>Upload limits</SectionHeading>
            <Field label="Maximum image size (bytes)" hint="0 = no limit">
              <Input class="w-full" type="number" name="maximagesize" value={d().maximagesize ?? 0} min={0} />
            </Field>

            <hr class="border-rim" />

            {/* ── Advanced ── */}
            <SectionHeading>Advanced</SectionHeading>
            <Toggle name="verifyssl" label="Verify SSL certificates" checked={d().verifyssl ?? true} />
            <Field label="Proxy URL">
              <Input class="w-full" name="proxy" value={d().proxy ?? ''} />
            </Field>
            <Field label="Proxy username">
              <Input class="w-full" name="proxyuser" value={d().proxyuser ?? ''} />
            </Field>
            <Field label="Network timeout (seconds)" hint="0 = unlimited (not recommended)">
              <Input
                class="w-full"
                type="number"
                name="curl_timeout"
                value={d().curl_timeout ?? 60}
                min={0}
              />
            </Field>
            <Field label="Delivery interval (seconds)" hint="Delay between background delivery processes. 4-5 for shared hosts, 2-3 for VPS.">
              <Input
                class="w-full"
                type="number"
                name="delivery_interval"
                value={d().delivery_interval ?? 2}
                min={0}
              />
            </Field>
            <Field label="Deliveries per process" hint="Number of deliveries per OS process (default 1)">
              <Input
                class="w-full"
                type="number"
                name="delivery_batch_count"
                value={d().delivery_batch_count ?? 1}
                min={1}
              />
            </Field>
            <Field label="Poll interval (seconds)" hint="0 = use delivery interval">
              <Input
                class="w-full"
                type="number"
                name="poll_interval"
                value={d().poll_interval ?? 2}
                min={0}
              />
            </Field>
            <Field label="Maximum load average" hint="Defer delivery when system load exceeds this (default 50)">
              <Input class="w-full" type="number" name="maxloadavg" value={d().maxloadavg ?? 50} min={1} />
            </Field>
            <Field label="Imported content expiry (days)" hint="0 = never expire imported grid/network content">
              <Input
                class="w-full"
                type="number"
                name="default_expire_days"
                value={d().default_expire_days ?? 30}
                min={0}
              />
            </Field>
            <Field label="Preserve active posts (days)" hint="Don't expire posts with comments newer than this many days">
              <Input
                class="w-full"
                type="number"
                name="active_expire_days"
                value={d().active_expire_days ?? 7}
                min={0}
              />
            </Field>
            <Field label="ImageMagick convert path" hint="e.g. /usr/bin/convert — used for thumbnailing very large images">
              <Input class="w-full" name="imagick_path" value={d().imagick_path ?? ''} />
            </Field>

            <SaveBar saving={saving()} label={t("admin.save")} savingLabel={t("admin.saving")} />
          </form>
        )}
      </Show>
    </SubPageContent>
  );
}

function SectionHeading(props: { children: any }) {
  return (
    <h3 class="text-xs font-semibold uppercase tracking-wider text-muted pt-1">
      {props.children}
    </h3>
  );
}



function SiteLogoField(props: { site: AdminSite }) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  let fileInput: HTMLInputElement | undefined;

  async function handleFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    try {
      await uploadSiteLogo(file, setProgress);
      toast.success("Site logo updated");
      await queryClient.invalidateQueries({ queryKey: ["settings", "admin-site"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await removeSiteLogo();
      toast.success("Site logo removed");
      await queryClient.invalidateQueries({ queryKey: ["settings", "admin-site"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div class="flex items-center gap-4">
      <Card class="w-16 h-16 flex items-center justify-center overflow-hidden shrink-0">
        <Show
          when={props.site.sitelogo_192}
          fallback={<span class="text-xs text-muted">None</span>}
        >
          <img src={props.site.sitelogo_192} alt="Site logo" class="w-full h-full object-contain" />
        </Show>
      </Card>
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <Button variant="ghost" disabled={uploading()} onClick={() => fileInput?.click()}>
            {uploading() ? `Uploading… ${progress()}%` : "Upload"}
          </Button>
          <Show when={props.site.sitelogo_192}>
            <Button variant="ghost" disabled={uploading()} onClick={handleRemove}>
              Remove
            </Button>
          </Show>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          class="hidden"
          onChange={handleFile}
        />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div class="space-y-4 animate-pulse">
      {Array.from({ length: 8 }, () => (
        <div class="space-y-1.5">
          <div class="h-3.5 w-24 rounded bg-elevated" />
          <div class="h-9 w-full rounded-lg bg-elevated" />
        </div>
      ))}
    </div>
  );
}
