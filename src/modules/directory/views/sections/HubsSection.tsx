import { For, Show, createSignal, createMemo } from 'solid-js';
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchPubsites, type PubSite } from '../../hubs/api';
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineOpen_in_new } from "solid-icons/md";

const ACCESS_STYLES: Record<string, string> = {
  free:   'bg-accent-muted text-accent',
  tiered: 'bg-accent-muted text-accent',
  paid:   'bg-accent-muted text-accent',
};

const REGISTER_STYLES: Record<string, string> = {
  open:    'bg-accent-muted text-accent',
  approve: 'bg-accent-muted text-accent',
  closed:  'bg-overlay text-muted',
};

function Badge(props: { label: string; styles: Record<string, string> }) {
  const cls = () =>
    props.styles[props.label.toLowerCase()] ??
    'bg-overlay text-muted';
  return (
    <span class={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${cls()}`}>
      {props.label}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div class="rounded-xl border border-rim bg-surface p-4 space-y-3 animate-pulse">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-overlay" />
        <div class="h-4 w-40 rounded bg-overlay" />
      </div>
      <div class="flex gap-2">
        <div class="h-5 w-12 rounded-md bg-overlay" />
        <div class="h-5 w-16 rounded-md bg-overlay" />
      </div>
      <div class="h-3 w-24 rounded bg-overlay" />
    </div>
  );
}

function HubCard(props: { site: PubSite }) {
  const initial = () => props.site.urltext.charAt(0).toUpperCase();
  const version = () => props.site.version ? `v${props.site.version}` : '';

  return (
		<a 
      href={props.site.register_url}
      target="_blank"
      rel="noopener noreferrer"
      class="group block rounded-xl border border-rim
             bg-surface p-4 space-y-3
             hover:border-accent hover:shadow-sm transition-all duration-200"
    >
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-accent-txt
                    flex items-center justify-center text-accent-fg text-sm font-semibold shrink-0">
          {initial()}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-txt truncate
                    group-hover:text-accent transition-colors">
            {props.site.urltext}
          </p>
          <Show when={props.site.location}>
            <p class="text-xs text-muted mt-0.5 truncate">
              {props.site.location}
            </p>
          </Show>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <Badge label={props.site.access} styles={ACCESS_STYLES} />
        <Badge label={props.site.register} styles={REGISTER_STYLES} />
      </div>

      <div class="flex items-center justify-between">
        <span class="text-xs text-muted">
          {props.site.project}
          <Show when={version()}>
            <span class="ml-1 font-mono">{version()}</span>
          </Show>
        </span>
        <MdOutlineOpen_in_new class="w-3.5 h-3.5 text-muted group-hover:text-accent
                    group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
      </div>
    </a>
  );
}

export default function PubsitesView() {
  const { t } = useI18n();
  const [sites] = createQueryResource("pubsites", fetchPubsites);
  const [filter, setFilter] = createSignal('');
  const [accessFilter, setAccessFilter] = createSignal('all');
  const [registerFilter, setRegisterFilter] = createSignal('all');

  const filtered = createMemo(() => {
    const q = filter().toLowerCase();
    return (sites() ?? []).filter((s) => {
      const matchText = !q || s.urltext.toLowerCase().includes(q) || s.location?.toLowerCase().includes(q);
      const matchAccess = accessFilter() === 'all' || s.access === accessFilter();
      const matchReg = registerFilter() === 'all' || s.register === registerFilter();
      return matchText && matchAccess && matchReg;
    });
  });

  return (
    <div class="px-4 md:px-6 py-6 space-y-4">
      {/* Header */}
      <div>
        <h1 class="text-2xl font-bold text-txt">{t("directory.public_hubs")}</h1>
        <p class="mt-1 text-sm text-muted max-w-3xl">
          {t("directory.hubs_subtext")}
        </p>
      </div>

      {/* Filters */}
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          placeholder={t("directory.search_hubs")}
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
          class="flex-1 px-3 py-2 text-sm rounded-lg border border-rim
                 bg-surface text-txt
                 placeholder:text-muted focus:outline-none focus:ring-2
                 focus:ring-accent/40 focus:border-accent transition"
        />
        <select
          value={accessFilter()}
          onChange={(e) => setAccessFilter(e.currentTarget.value)}
          class="px-3 py-2 text-sm rounded-lg border border-rim
                 bg-surface text-txt
                 focus:outline-none focus:ring-2 focus:ring-accent/40 transition"
        >
          <option value="all">{t("directory.all_access")}</option>
          <option value="free">{t("directory.access_free")}</option>
          <option value="tiered">{t("directory.access_tiered")}</option>
          <option value="paid">{t("directory.access_paid")}</option>
        </select>
        <select
          value={registerFilter()}
          onChange={(e) => setRegisterFilter(e.currentTarget.value)}
          class="px-3 py-2 text-sm rounded-lg border border-rim
                 bg-surface text-txt
                 focus:outline-none focus:ring-2 focus:ring-accent/40 transition"
        >
          <option value="all">{t("directory.all_registration")}</option>
          <option value="open">{t("directory.reg_open")}</option>
          <option value="approve">{t("directory.reg_approve")}</option>
          <option value="closed">{t("directory.reg_closed")}</option>
        </select>
      </div>

      {/* Stats row */}
      <Show when={!sites.loading && (sites()?.length ?? 0) > 0}>
        <div class="flex items-center gap-4 text-xs text-muted">
          <span>{filtered().length} {t("directory.of_hubs")} {sites()!.length} {t("directory.hubs_label")}</span>
          <span>·</span>
          <span>{sites()!.filter(s => s.register === 'open').length} {t("directory.open_registration")}</span>
          <span>·</span>
          <span>{sites()!.filter(s => s.access === 'free').length} {t("directory.free_access")}</span>
        </div>
      </Show>

      {/* Loading */}
      <Show when={sites.loading}>
        <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
          <For each={Array(9).fill(0)}>{() => <SkeletonCard />}</For>
        </div>
      </Show>

      {/* Empty */}
      <Show when={!sites.loading && filtered().length === 0}>
        <div class="text-center py-16 text-muted">
          <p class="text-4xl mb-3">○</p>
          <p class="text-sm">{t("directory.no_hubs")}</p>
        </div>
      </Show>

      {/* Grid */}
      <Show when={!sites.loading && filtered().length > 0}>
        <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
          <For each={filtered()}>{(site) => <HubCard site={site} />}</For>
        </div>
      </Show>
    </div>
  );
}
