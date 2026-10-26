import { For, Show, type JSX } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Modal, ModalPanel } from "@ui/Modal";
import { buttonClass } from "@ui/Button";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { Spinner } from "@ui/Spinner";
import { ErrorState } from "@ui/ErrorState";
import { humanBytes } from "@/shared/lib/quota-format";
import { fetchHubInfo, type HubInfo, type PubSite } from "../../hubs/api";

// The server already drops non-http(s) urls; this keeps a javascript: link
// out even if a cached or offline-replayed response somehow carries one.
const safeHref = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : undefined);

// "DIRECTORY_MODE_STANDALONE" → "Standalone"
const constLabel = (v: string, prefix: string) => {
  const s = v.replace(prefix, "").replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const humanKey = (k: string) => k.replace(/_/g, " ");

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="space-y-2">
      <h3 class="text-xs font-semibold text-muted uppercase tracking-wider">{props.title}</h3>
      {props.children}
    </section>
  );
}

// Label over value: reads as a compact fact sheet in a 2–3 column grid,
// rather than rows whose label and value sit a whole panel-width apart.
function Fact(props: { label: string; children: JSX.Element }) {
  return (
    <div class="min-w-0">
      <dt class="text-xs text-muted">{props.label}</dt>
      <dd class="text-sm text-txt break-words">{props.children}</dd>
    </div>
  );
}

function Num(props: { label: string; value: number | null }) {
  return (
    <Show when={props.value != null}>
      <div class="flex-1 min-w-0 bg-surface px-3 py-2.5 text-center">
        <p class="text-lg font-semibold tabular-nums text-txt">{props.value!.toLocaleString()}</p>
        <p class="text-xs text-muted leading-tight">{props.label}</p>
      </div>
    </Show>
  );
}

// siteinfo.json carries no photo, so the avatar is name-hue initials. The
// whole tile links to the channel; one with no safe url renders inert.
function AdminTile(props: { admin: HubInfo["admin"][number] }) {
  const body = () => (
    <>
      <Avatar name={props.admin.name} size={9} />
      <span class="min-w-0">
        <span class="block text-sm font-medium text-txt truncate group-hover:text-accent-txt">{props.admin.name}</span>
        <span class="block text-xs text-muted truncate" title={props.admin.address}>{props.admin.address}</span>
      </span>
    </>
  );
  const cls = "group flex items-center gap-3 rounded-lg border border-rim px-3 py-2";
  return (
    <Show when={safeHref(props.admin.channel)} fallback={<div class={cls}>{body()}</div>}>
      {(href) => (
        <a href={href()} target="_blank" rel="noopener noreferrer" class={`${cls} hover:border-accent transition-colors`}>
          {body()}
        </a>
      )}
    </Show>
  );
}

export default function HubInfoModal(props: { site: PubSite; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [info, { refetch }] = createQueryResource("hub-info", () => props.site.host, fetchHubInfo);

  // Core reports lastpoll as "Y-m-d H:i:s" in UTC; an unparseable value shows as-is.
  const localTime = (utc: string) => {
    const date = new Date(utc.replace(" ", "T") + "Z");
    return isNaN(date.getTime()) ? utc : date.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
  };
  const yesNo = (b: boolean) => (b ? t("directory.hub_yes") : t("directory.hub_no"));
  const regLabel = (p: string) =>
    p === "REGISTER_OPEN" ? t("directory.reg_open")
    : p === "REGISTER_APPROVE" ? t("directory.reg_approve")
    : t("directory.reg_closed");

  return (
    <Modal onClose={props.onClose}>
      <ModalPanel
        size="lg"
        title={info()?.site_name || props.site.urltext}
        description={
          <span class="flex flex-wrap items-center gap-1.5">
            <span>{props.site.urltext}</span>
            <Show when={info()}>
              {(d) => (
                <>
                  <Badge size="sm">{regLabel(d().register_policy)}</Badge>
                  <Show when={d().invitation_only}><Badge size="sm" tone="warning">{t("directory.hub_invite_only")}</Badge></Show>
                  <Show when={d().language}><Badge size="sm">{d().language}</Badge></Show>
                </>
              )}
            </Show>
          </span>
        }
        onClose={props.onClose}
        footer={
          <>
            <Show when={safeHref(props.site.url)}>
              {(href) => (
                <a href={href()} target="_blank" rel="noopener noreferrer" class={buttonClass("ghost", "sm")}>
                  {t("directory.hub_visit")}
                </a>
              )}
            </Show>
            <Show when={safeHref(props.site.register_url)}>
              {(href) => (
                <a href={href()} target="_blank" rel="noopener noreferrer" class={buttonClass("primary", "sm")}>
                  {t("directory.hub_register")}
                </a>
              )}
            </Show>
          </>
        }
      >
        <div class="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-5">
          <Show when={info.loading && !info()}>
            <div class="flex justify-center py-12"><Spinner size="lg" label={t("directory.hub_loading")} /></div>
          </Show>

          <Show when={info.error}>
            <ErrorState message={t("directory.hub_error")} retry={refetch} />
          </Show>

          <Show when={info()}>
            {(d) => (
              <>
                <Show when={d().info}>
                  <p class="text-sm text-txt whitespace-pre-line">{d().info}</p>
                </Show>

                <Show
                  when={!d().hide_in_statistics}
                  fallback={<p class="text-sm text-muted">{t("directory.hub_stats_hidden")}</p>}
                >
                  {/* Hairline gaps over a rim-coloured bed draw the dividers.
                     Two fixed rows: people (channels, activity), then content. */}
                  <div class="grid gap-px bg-rim rounded-xl border border-rim overflow-hidden">
                    <div class="flex gap-px">
                      <Num label={t("directory.hub_channels")} value={d().channels_total} />
                      <Num label={t("directory.hub_active_month")} value={d().channels_active_monthly} />
                      <Num label={t("directory.hub_active_halfyear")} value={d().channels_active_halfyear} />
                    </div>
                    <div class="flex gap-px">
                      <Num label={t("directory.hub_posts")} value={d().local_posts} />
                      <Num label={t("directory.hub_comments")} value={d().local_comments} />
                    </div>
                  </div>
                </Show>

                <Section title={t("directory.hub_details")}>
                  <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                    <Fact label={t("directory.hub_software")}>
                      {[d().platform, d().version].filter(Boolean).join(" ")}
                      <Show when={d().commit}><span class="ml-1.5 font-mono text-xs text-muted">{d().commit}</span></Show>
                    </Fact>
                    <Show when={d().server_role}><Fact label={t("directory.hub_server_role")}>{d().server_role}</Fact></Show>
                    <Show when={d().directory_mode}>
                      <Fact label={t("directory.hub_directory")}>
                        {constLabel(d().directory_mode, "DIRECTORY_MODE_")}
                        <Show when={safeHref(d().directory_server)}>
                          {(href) => (
                            <a href={href()} target="_blank" rel="noopener noreferrer" class="block text-xs text-accent-txt hover:underline truncate">
                              {href().replace(/^https?:\/\//, "")}
                            </a>
                          )}
                        </Show>
                      </Fact>
                    </Show>
                    <Show when={d().expiration != null}>
                      <Fact label={t("directory.hub_expiration")}>
                        {d().expiration ? t("directory.hub_expire_days", { n: d().expiration! }) : t("directory.hub_never")}
                      </Fact>
                    </Show>
                    <Fact label={t("directory.hub_rss")}>{yesNo(d().rss_connections)}</Fact>
                    <Show when={d().dbdriver}><Fact label={t("directory.hub_database")}>{d().dbdriver}</Fact></Show>
                    <Show when={d().lastpoll}><Fact label={t("directory.hub_lastpoll")}>{localTime(d().lastpoll)}</Fact></Show>
                  </dl>
                </Section>

                <Show when={d().admin.length}>
                  <Section title={t("directory.hub_admins")}>
                    <ul class="grid sm:grid-cols-2 gap-2">
                      <For each={d().admin}>{(a) => <li class="min-w-0"><AdminTile admin={a} /></li>}</For>
                    </ul>
                  </Section>
                </Show>

                <Show when={Object.keys(d().default_service_restrictions).length}>
                  <Section title={t("directory.hub_limits")}>
                    <dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                      <For each={Object.entries(d().default_service_restrictions)}>
                        {([k, v]) => (
                          <Fact label={humanKey(k)}>{k.endsWith("_upload_limit") ? humanBytes(v) : v.toLocaleString()}</Fact>
                        )}
                      </For>
                    </dl>
                  </Section>
                </Show>

                <Show when={d().plugins.length}>
                  <Section title={`${t("directory.hub_addons")} (${d().plugins.length})`}>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={d().plugins}>{(p) => <Badge size="sm">{p}</Badge>}</For>
                    </div>
                  </Section>
                </Show>

                <Show when={d().locked_features.length}>
                  <Section title={t("directory.hub_locked_features")}>
                    <div class="flex flex-wrap gap-1.5">
                      <For each={d().locked_features}>{(f) => <Badge size="sm" tone="warning">{humanKey(f)}</Badge>}</For>
                    </div>
                  </Section>
                </Show>
              </>
            )}
          </Show>
        </div>
      </ModalPanel>
    </Modal>
  );
}
