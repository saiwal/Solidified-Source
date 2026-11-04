import { For, Show, createSignal, createMemo, lazy } from 'solid-js';
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchPubsites, type PubSite } from '../../hubs/api';
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineDns } from "solid-icons/md";
import CardShell from "@/shared/stream/CardShell";
import { resetReveal } from "@/shared/stream/reveal";
import { Section, SearchToggle } from "../Section";
import { Select } from "@ui/Field";
import { Tabs } from "@ui/Tabs";
import { Badge } from "@ui/Badge";
import type { BadgeTone } from "@utsukta/spa-core/types/ui.types";
import { cardClass } from "@ui/Card";
import { EmptyState } from "@ui/EmptyState";
import { Skeleton } from "@ui/Skeleton";
import { useMapsEnabled } from "@utsukta/spa-core/lib/useOsmMap";

const HubInfoModal = lazy(() => import("./HubInfoModal"));
const PlaceMap = lazy(() => import("@/shared/views/PlaceMap"));

// Registration is the one that decides whether you can join, so it carries
// the status colour; access is plain information.
const REGISTER_TONE: Record<string, BadgeTone> = { open: "success", approve: "warning", closed: "neutral" };

const GRID = "grid gap-3 grid-cols-[repeat(auto-fit,minmax(17rem,1fr))]";

function SkeletonCard() {
  return (
    <div class={`${cardClass()} p-4 space-y-3`}>
      <div class="flex items-center gap-3">
        <Skeleton tone="overlay" class="w-9 h-9 rounded-lg" />
        <Skeleton tone="overlay" class="h-4 w-40" />
      </div>
      <div class="flex gap-2">
        <Skeleton tone="overlay" class="h-5 w-12" />
        <Skeleton tone="overlay" class="h-5 w-16" />
      </div>
      <Skeleton tone="overlay" class="h-3 w-24" />
    </div>
  );
}

function HubCard(props: { site: PubSite; onOpen: () => void }) {
  const { t } = useI18n();
  const initial = () => props.site.urltext.charAt(0).toUpperCase();
  const version = () => props.site.version ? `v${props.site.version}` : '';
  const label = (prefix: "access" | "reg", v: string) =>
    (t(`directory.${prefix}_${v}` as any) as string) || v;

  return (
    <button
      type="button"
      onClick={props.onOpen}
      class={`${cardClass()} group block w-full text-left p-4 space-y-3 hover:border-rim-strong transition-colors`}
    >
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-lg bg-accent-muted text-accent-txt
                    flex items-center justify-center text-sm font-semibold shrink-0">
          {initial()}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-txt truncate group-hover:text-accent-txt transition-colors">
            {props.site.urltext}
          </p>
          <Show when={props.site.location}>
            <p class="text-xs text-muted mt-0.5 truncate">{props.site.location}</p>
          </Show>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <Badge size="sm" tone={REGISTER_TONE[props.site.register] ?? "neutral"}>
          {label("reg", props.site.register)}
        </Badge>
        <Badge size="sm">{label("access", props.site.access)}</Badge>
      </div>

      <p class="text-xs text-muted truncate">
        {props.site.project}
        <Show when={version()}>
          <span class="ml-1 tabular-nums">{version()}</span>
        </Show>
      </p>
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
  const showMap = () => mapsOn() && view() === 'map';
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
    <Section
      panel={false}
      title={t("directory.public_hubs")}
      description={t("directory.hubs_subtext")}
      tools={
        <>
          <SearchToggle live applied={filter()} onSearch={setFilter} placeholder={t("directory.search_hubs")} />
          <Show when={mapsOn()}>
            <Tabs
              variant="segmented"
              label={t("ui.view_map")}
              value={view()}
              onChange={setView}
              items={[{ value: 'grid', label: t("ui.view_grid") }, { value: 'map', label: t("ui.view_map") }]}
            />
          </Show>
        </>
      }
    >
      {/* ── Filters + counts ── */}
      <div class="flex flex-wrap items-center gap-2">
        <Select
          class="w-40"
          aria-label={t("directory.all_access")}
          value={accessFilter()}
          onChange={(e) => { resetReveal(); setAccessFilter(e.currentTarget.value); }}
        >
          <option value="all">{t("directory.all_access")}</option>
          <option value="free">{t("directory.access_free")}</option>
          <option value="tiered">{t("directory.access_tiered")}</option>
          <option value="paid">{t("directory.access_paid")}</option>
        </Select>
        <Select
          class="w-44"
          aria-label={t("directory.all_registration")}
          value={registerFilter()}
          onChange={(e) => { resetReveal(); setRegisterFilter(e.currentTarget.value); }}
        >
          <option value="all">{t("directory.all_registration")}</option>
          <option value="open">{t("directory.reg_open")}</option>
          <option value="approve">{t("directory.reg_approve")}</option>
          <option value="closed">{t("directory.reg_closed")}</option>
        </Select>
        <Show when={!sites.loading && (sites()?.length ?? 0) > 0}>
          <p class="ml-auto text-xs text-muted tabular-nums">
            {filtered().length} {t("directory.of_hubs")} {sites()!.length} {t("directory.hubs_label")}
          </p>
        </Show>
      </div>

      <Show when={sites.loading}>
        <div class={GRID}>
          <For each={Array(9).fill(0)}>{() => <SkeletonCard />}</For>
        </div>
      </Show>

      <Show when={!sites.loading && filtered().length === 0}>
        <EmptyState icon={<MdOutlineDns />}>{t("directory.no_hubs")}</EmptyState>
      </Show>

      {/* Map — a pin shared by several hubs narrows the grid to that place */}
      <Show when={!sites.loading && filtered().length > 0 && showMap()}>
        <PlaceMap
          items={filtered().map((s) => ({ place: s.location ?? '', name: s.urltext, open: () => setSelected(s) }))}
          onGroup={(place) => { setFilter(place); setView('grid'); }}
        />
      </Show>

      <Show when={!sites.loading && filtered().length > 0 && !showMap()}>
        <div class={GRID}>
          <For each={filtered()}>{(site) => <CardShell uuid={site.url} class="grid"><HubCard site={site} onOpen={() => setSelected(site)} /></CardShell>}</For>
        </div>
      </Show>

      <Show when={selected()}>
        {(s) => <HubInfoModal site={s()} onClose={() => setSelected(null)} />}
      </Show>
    </Section>
  );
}
