// Ctrl/Cmd+K: jump to any app, or (local users) search wiki, articles, cards,
// notes, posts, files and bookmarks at once. Mounted once in Layout. The
// mobile app drawer reuses the same search pieces in its own sheet.
import { createMemo, createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import type { NavItemDef } from "@utsukta/spa-core/types/module.types";
import { Modal, modalPanelClass } from "@ui/Modal";
import { SearchField } from "@ui/SearchField";
import { Spinner } from "@ui/Spinner";
import { MdOutlineTune } from "solid-icons/md";
import { IconButton } from "@ui/Button";
import { getNavIcon } from "../NavItem";
import ResultList, { entryId, type Entry } from "./ResultList";
import SearchFilters from "./SearchFilters";
import {
  emptyFilters, FIND_ICON, paletteOpen, setPaletteOpen, useContentSearch, type FindResult,
} from "./search";

const label = (i: NavItemDef) => (typeof i.label === "function" ? i.label() : i.label);
const href = (i: NavItemDef) => (typeof i.href === "function" ? i.href() : i.href);

/** Nav items as palette entries: all matches, or the first few when idle. */
export function navEntries(items: NavItemDef[], term: string, group: string): Entry[] {
  const q = term.trim().toLowerCase();
  const hits = q ? items.filter((i) => label(i).toLowerCase().includes(q)) : items.slice(0, 8);
  return hits.map((i) => ({ key: `nav:${i.path}`, group, title: label(i), href: href(i), icon: getNavIcon(i.icon, 18) }));
}

export function contentEntries(results: FindResult[], groupOf: (r: FindResult) => string): Entry[] {
  return results.map((r) => ({
    key: `${r.type}:${r.id}`,
    group: groupOf(r),
    title: r.title,
    subtitle: r.snippet || undefined,
    href: r.url,
    external: r.external,
    icon: getNavIcon(FIND_ICON[r.type], 18),
  }));
}

export default function CommandPalette(props: { navItems: Accessor<NavItemDef[]> }) {
  // Global shortcut. Ctrl+K in a browser otherwise focuses the URL bar's search.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen());
      }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <Show when={paletteOpen()}>
      <Palette navItems={props.navItems} onClose={() => setPaletteOpen(false)} />
    </Show>
  );
}

function Palette(props: { navItems: Accessor<NavItemDef[]>; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [term, setTerm] = createSignal("");
  const [filters, setFilters] = createSignal(emptyFilters());
  const [showFilters, setShowFilters] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const { results } = useContentSearch(term, filters, isLocalUser);

  const entries = createMemo(() => {
    const nav = navEntries(props.navItems(), term(), t("layout.palette_jump"));
    const content = contentEntries(results() ?? [], (r) => t(`layout.palette_type_${r.type}`));
    return [...nav, ...content];
  });
  // Keep the highlight in range as results stream in.
  const activeIdx = () => Math.min(active(), Math.max(0, entries().length - 1));

  const open = (e: Entry) => {
    props.onClose();
    if (e.external) window.open(e.href, "_blank", "noopener");
    else navigate(e.href);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    const n = entries().length;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!n) return;
      const next = (activeIdx() + (ev.key === "ArrowDown" ? 1 : -1) + n) % n;
      setActive(next);
      document.getElementById(entryId("hz-palette", next))?.scrollIntoView({ block: "nearest" });
    } else if (ev.key === "Enter" && n && (ev.target as HTMLElement).tagName === "INPUT"
      && (ev.target as HTMLInputElement).type === "search") {
      ev.preventDefault();
      open(entries()[activeIdx()]);
    }
  };

  return (
    <Modal onClose={props.onClose} label={t("layout.palette_title")}
      class="!items-start pt-[12vh]">
      <div class={`${modalPanelClass("xl")} flex flex-col max-h-[70vh] overflow-clip`} onKeyDown={onKeyDown}>
        <div class="flex items-center gap-2 p-3 border-b border-rim">
          <SearchField
            class="flex-1"
            value={term()}
            onInput={(v) => { setTerm(v); setActive(0); }}
            label={t("layout.palette_title")}
            clearLabel={t("layout.clear_search")}
            placeholder={t("layout.palette_placeholder")}
            autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="hz-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={entries().length ? entryId("hz-palette", activeIdx()) : undefined}
          />
          <Show when={isLocalUser()}>
            <IconButton label={t("layout.palette_filters")} pressed={showFilters()} onClick={() => setShowFilters(!showFilters())}>
              <MdOutlineTune size={18} />
            </IconButton>
          </Show>
        </div>
        <Show when={showFilters()}>
          <div class="px-3 py-2 border-b border-rim">
            <SearchFilters value={filters()} onChange={(f) => { setFilters(f); setActive(0); }} />
          </div>
        </Show>
        <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <ResultList entries={entries()} idPrefix="hz-palette" active={activeIdx()} onHover={setActive}
            onPick={(e, ev) => {
              if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;
              ev.preventDefault();
              open(e);
            }} />
          <Show when={results.loading}>
            <div class="flex items-center gap-2 px-4 py-3 text-sm text-muted"><Spinner size="sm" /> {t("layout.palette_searching")}</div>
          </Show>
          <Show when={!results.loading && entries().length === 0}>
            <p class="px-4 py-6 text-center text-sm text-muted">{t("layout.palette_no_results")}</p>
          </Show>
        </div>
        <p class="hidden sm:block px-4 py-2 border-t border-rim text-[0.6875rem] text-muted">{t("layout.palette_hint")}</p>
      </div>
    </Modal>
  );
}

