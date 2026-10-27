import { For, Show, createSignal, createMemo, lazy } from 'solid-js';
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchPubsites, type PubSite } from '../../hubs/api';
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineInfo } from "solid-icons/md";
import CardShell from "@/shared/stream/CardShell";
import { resetReveal } from "@/shared/stream/reveal";
import { Input, Select } from "@ui/Field";
import { Tabs } from "@ui/Tabs";
import { useMapsEnabled } from "@utsukta/spa-core/lib/useOsmMap";

const HubInfoModal = lazy(() => import("./HubInfoModal"));
const PlaceMap = lazy(() => import("@/shared/views/PlaceMap"));

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

function HubCard(props: { site: PubSite; onOpen: () => void }) {
  const initial = () => props.site.urltext.charAt(0).toUpperCase();
  const version = () => props.site.version ? `v${props.site.version}` : '';

  return (
    <button
      type="button"
      onClick={props.onOpen}
      class="group block w-full text-left rounded-xl border border-rim
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
        <MdOutlineInfo class="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors" aria-hidden="true" />
      </div>
    </button>
  );
}

export default function PubsitesView() {
  const { t } = useI18n();
  const [sites] = createQueryResource("pubsites", fetchPubsites);
  const [filter, setFilter] = createSignal('');
  const [accessFilter, setAccessFilter] = createSignal('all');
  const [registerFilter, setRegisterFilter] = createSignal('all');
  const [selected, setSelected] = createSignal<PubSite | null>(null);
  const [view, setView] = createSignal<'grid' | 'map'>('grid');
  const mapsOn = useMapsEnabled();
  // Each visit / dropdown change is a new list: let cards enter again, as
  // streams do. Not on keystrokes — the search box would replay constantly.
  resetReveal();

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
        <Input
          class="flex-1"
          type="search"
          placeholder={t("directory.search_hubs")}
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <Select
          value={accessFilter()}
          onChange={(e) => { resetReveal(); setAccessFilter(e.currentTarget.value); }}
        >
          <option value="all">{t("directory.all_access")}</option>
          <option value="free">{t("directory.access_free")}</option>
          <option value="tiered">{t("directory.access_tiered")}</option>
          <option value="paid">{t("directory.access_paid")}</option>
        </Select>
        <Select
          value={registerFilter()}
          onChange={(e) => { resetReveal(); setRegisterFilter(e.currentTarget.value); }}
        >
          <option value="all">{t("directory.all_registration")}</option>
          <option value="open">{t("directory.reg_open")}</option>
          <option value="approve">{t("directory.reg_approve")}</option>
          <option value="closed">{t("directory.reg_closed")}</option>
        </Select>
        <Show when={mapsOn()}>
          <Tabs
            variant="segmented"
            label={t("ui.view_map")}
            value={view()}
            onChange={setView}
            items={[{ value: 'grid', label: t("ui.view_grid") }, { value: 'map', label: t("ui.view_map") }]}
          />
        </Show>
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

      {/* Map — a pin shared by several hubs narrows the grid to that place */}
      <Show when={!sites.loading && filtered().length > 0 && mapsOn() && view() === 'map'}>
        <PlaceMap
          items={filtered().map((s) => ({ place: s.location ?? '', name: s.urltext, open: () => setSelected(s) }))}
          onGroup={(place) => { setFilter(place); setView('grid'); }}
        />
      </Show>

      {/* Grid */}
      <Show when={!sites.loading && filtered().length > 0 && !(mapsOn() && view() === 'map')}>
        <div class="grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]">
          <For each={filtered()}>{(site) => <CardShell uuid={site.url} class="grid"><HubCard site={site} onOpen={() => setSelected(site)} /></CardShell>}</For>
        </div>
      </Show>

      <Show when={selected()}>
        {(s) => <HubInfoModal site={s()} onClose={() => setSelected(null)} />}
      </Show>
    </div>
  );
}
