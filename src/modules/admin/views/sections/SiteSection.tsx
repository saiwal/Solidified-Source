import { createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useQueryClient } from "@tanstack/solid-query";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminSite, saveAdminSite, fetchAdminThemes, uploadSiteLogo, removeSiteLogo } from "../../api";
import { useSectionForm } from "@/modules/settings/store/useSectionForm";
import type { AdminSite } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";

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
      action={
        <Show when={data()}>
          <button
            form="site-form"
            type="submit"
            disabled={saving()}
            class="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-fg
                   hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving() ? t("admin.saving") : t("admin.save")}
          </button>
        </Show>
      }
    >
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <form id="site-form" onSubmit={handleSubmit} class="space-y-5">

            {/* ── Basic Identity ── */}
            <SectionHeading>Basic</SectionHeading>
            <Field label="Site name">
              <input name="sitename" value={d().sitename ?? ''} class={inputCls} />
            </Field>
            <Field label="Site location" hint="Region or country">
              <input name="site_location" value={d().site_location ?? ''} class={inputCls} />
            </Field>
            <Field label="Banner / logo" hint="Unfiltered HTML/CSS/JS is allowed">
              <input name="banner" value={d().banner ?? ''} class={inputCls} />
            </Field>
            <Field
              label="Site logo"
              hint="Used as the browser favicon, PWA icon, and in the app nav. Square images work best — non-square images are center-cropped, not stretched. At least 512x512 px recommended; max 4000x4000 px."
            >
              <SiteLogoField site={d()} />
            </Field>
            <Field label="Admin info" hint="Shown on siteinfo page. BBCode accepted.">
              <textarea name="admininfo" rows={3} class={inputCls}>{d().admininfo ?? ''}</textarea>
            </Field>
            <Field label="Site info" hint="Public description. BBCode accepted.">
              <textarea name="siteinfo" rows={3} class={inputCls}>{d().siteinfo ?? ''}</textarea>
            </Field>
            <Field label="System language" hint="Language code, e.g. 'en', 'de', 'fr'">
              <input name="language" value={d().language ?? 'en'} class={inputCls} />
            </Field>
            <Field label="Default theme" hint="Users may override this in their own profile.">
              <div class="flex gap-2 items-center">
                <select name="theme" class={`${inputCls} flex-1`}>
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
                </select>
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
              <select name="default_permissions_role" class={inputCls}>
                {PERMISSION_ROLES.map((r) => (
                  <option value={r.value} selected={(d().default_permissions_role ?? 'personal') === r.value}>{r.label}</option>
                ))}
              </select>
            </Field>

            <hr class="border-rim" />

            {/* ── Registration ── */}
            <SectionHeading>Registration</SectionHeading>
            <Field label="Registration policy">
              <select name="register_policy" class={inputCls}>
                {REGISTER_POLICIES.map((p) => (
                  <option value={p.value} selected={(d().register_policy ?? 0) === p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Registration page text" hint="Shown prominently on the registration form">
              <textarea name="register_text" rows={3} class={inputCls}>{d().register_text ?? ''}</textarea>
            </Field>
            <Field label="Max daily registrations" hint="0 = unlimited (default 50)">
              <input type="number" name="max_daily_registrations" value={d().max_daily_registrations ?? 50} min={0} class={inputCls} />
            </Field>
            <Field label="Max registrations from same IP" hint="0 = unlimited (default 3)">
              <input type="number" name="register_sameip" value={d().register_sameip ?? 3} min={0} class={inputCls} />
            </Field>
            <Field label="Minimum age" hint="Minimum age in years for registration (default 13)">
              <input type="number" name="minimum_age" value={d().minimum_age ?? 13} min={0} class={inputCls} />
            </Field>
            <Field label="Abandon account after (days)" hint="0 = no limit. Stops polling external sites for abandoned accounts.">
              <input type="number" name="abandon_days" value={d().abandon_days ?? 0} min={0} class={inputCls} />
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
              <select name="access_policy" class={inputCls}>
                {ACCESS_POLICIES.map((p) => (
                  <option value={p.value} selected={(d().access_policy ?? 2) === p.value}>{p.label}</option>
                ))}
              </select>
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
              <input name="frontpage" value={d().frontpage ?? ''} class={inputCls} />
            </Field>
            <Toggle name="mirror_frontpage" label="Present homepage in frame (don't redirect)" checked={d().mirror_frontpage ?? false} />
            <Field label="Landing page for new registrants" hint="URL of a marketing/sell page. Default: /register">
              <input name="site_sellpage" value={d().site_sellpage ?? ''} class={inputCls} />
            </Field>
            <Field label="Page shown after channel creation" hint="e.g. 'profiles' (default)">
              <input name="first_page" value={d().first_page ?? 'profiles'} class={inputCls} />
            </Field>
            <Field label="Allowed friend domains" hint="Comma-separated. Wildcards OK. Empty = allow all.">
              <input name="allowed_sites" value={d().allowed_sites ?? ''} class={inputCls} />
            </Field>

            <hr class="border-rim" />

            {/* ── Public Stream Filters ── */}
            <SectionHeading>Public stream filters</SectionHeading>
            <Field label="Include only posts matching" hint="Words, #tags, /patterns/, or lang=xx — one per line. Leave blank to import all.">
              <textarea name="pubstream_incl" rows={3} class={inputCls}>{d().pubstream_incl ?? ''}</textarea>
            </Field>
            <Field label="Exclude posts matching" hint="Same syntax as above.">
              <textarea name="pubstream_excl" rows={3} class={inputCls}>{d().pubstream_excl ?? ''}</textarea>
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
                <select name="directory_server" class={inputCls}>
                  <For each={dirChoices(d())}>
                    {(url) => (
                      <option value={url} selected={d().directory_server === url}>{url}</option>
                    )}
                  </For>
                </select>
              </Field>
            </Show>

            <hr class="border-rim" />

            {/* ── Email ── */}
            <SectionHeading>Email</SectionHeading>
            <Field label="Sender (From) email address for system generated email.">
              <input type="email" name="from_email" value={d().from_email ?? ''} class={inputCls} />
            </Field>
            <Field label="Name of email sender for system generated email.">
              <input name="from_email_name" value={d().from_email_name ?? ''} class={inputCls} />
            </Field>
            <Field label="Reply-to email address for system generated email.">
              <input type="email" name="reply_address" value={d().reply_address ?? ''} class={inputCls} />
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
              <input type="number" name="maximagesize" value={d().maximagesize ?? 0} min={0} class={inputCls} />
            </Field>

            <hr class="border-rim" />

            {/* ── Advanced ── */}
            <SectionHeading>Advanced</SectionHeading>
            <Toggle name="verifyssl" label="Verify SSL certificates" checked={d().verifyssl ?? true} />
            <Field label="Proxy URL">
              <input name="proxy" value={d().proxy ?? ''} class={inputCls} />
            </Field>
            <Field label="Proxy username">
              <input name="proxyuser" value={d().proxyuser ?? ''} class={inputCls} />
            </Field>
            <Field label="Network timeout (seconds)" hint="0 = unlimited (not recommended)">
              <input type="number" name="curl_timeout" value={d().curl_timeout ?? 60} min={0} class={inputCls} />
            </Field>
            <Field label="Delivery interval (seconds)" hint="Delay between background delivery processes. 4-5 for shared hosts, 2-3 for VPS.">
              <input type="number" name="delivery_interval" value={d().delivery_interval ?? 2} min={0} class={inputCls} />
            </Field>
            <Field label="Deliveries per process" hint="Number of deliveries per OS process (default 1)">
              <input type="number" name="delivery_batch_count" value={d().delivery_batch_count ?? 1} min={1} class={inputCls} />
            </Field>
            <Field label="Poll interval (seconds)" hint="0 = use delivery interval">
              <input type="number" name="poll_interval" value={d().poll_interval ?? 2} min={0} class={inputCls} />
            </Field>
            <Field label="Maximum load average" hint="Defer delivery when system load exceeds this (default 50)">
              <input type="number" name="maxloadavg" value={d().maxloadavg ?? 50} min={1} class={inputCls} />
            </Field>
            <Field label="Imported content expiry (days)" hint="0 = never expire imported grid/network content">
              <input type="number" name="default_expire_days" value={d().default_expire_days ?? 30} min={0} class={inputCls} />
            </Field>
            <Field label="Preserve active posts (days)" hint="Don't expire posts with comments newer than this many days">
              <input type="number" name="active_expire_days" value={d().active_expire_days ?? 7} min={0} class={inputCls} />
            </Field>
            <Field label="ImageMagick convert path" hint="e.g. /usr/bin/convert — used for thumbnailing very large images">
              <input name="imagick_path" value={d().imagick_path ?? ''} class={inputCls} />
            </Field>

          </form>
        )}
      </Show>
    </SubPageContent>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-rim bg-surface text-txt text-sm " +
  "hover:border-rim-strong focus:outline-none focus:border-rim-strong transition-colors";

function SectionHeading(props: { children: any }) {
  return (
    <h3 class="text-xs font-semibold uppercase tracking-wider text-muted pt-1">
      {props.children}
    </h3>
  );
}

function Field(props: { label: string; hint?: string; children: any }) {
  return (
    <div class="space-y-1.5">
      <label class="block text-sm font-medium text-txt">{props.label}</label>
      {props.children}
      <Show when={props.hint}>
        <p class="text-xs text-muted">{props.hint}</p>
      </Show>
    </div>
  );
}

function Toggle(props: { name: string; label: string; checked: boolean }) {
  return (
    <label class="flex items-center gap-3 cursor-pointer select-none">
      <input type="checkbox" name={props.name} value="1" checked={props.checked} class="sr-only peer" />
      <div class="relative w-9 h-5 bg-rim-strong rounded-full peer-checked:bg-accent transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-elevated after:transition-transform peer-checked:after:translate-x-4" />
      <span class="text-sm text-txt">{props.label}</span>
    </label>
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
      <div class="w-16 h-16 rounded-lg border border-rim bg-surface flex items-center justify-center overflow-hidden shrink-0">
        <Show
          when={props.site.sitelogo_192}
          fallback={<span class="text-xs text-muted">None</span>}
        >
          <img src={props.site.sitelogo_192} alt="Site logo" class="w-full h-full object-contain" />
        </Show>
      </div>
      <div class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <button
            type="button"
            disabled={uploading()}
            onClick={() => fileInput?.click()}
            class="px-3 py-2 text-sm rounded-lg border border-rim text-txt hover:bg-elevated
                   disabled:opacity-40 transition-colors"
          >
            {uploading() ? `Uploading… ${progress()}%` : "Upload"}
          </button>
          <Show when={props.site.sitelogo_192}>
            <button
              type="button"
              disabled={uploading()}
              onClick={handleRemove}
              class="px-3 py-2 text-sm rounded-lg border border-rim text-muted hover:text-txt hover:bg-elevated
                     disabled:opacity-40 transition-colors"
            >
              Remove
            </button>
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
