import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { useLocation } from "@solidjs/router";
import {
  resolveModuleSlot,
  resolveGlobalSlots,
  getWidget,
  getAllWidgets,
  getLazy,
  getWidgetVersion,
  isModuleActive,
  moduleIdForPath,
  widgetAllowedIn,
  widgetSlots,
  type RegisteredWidget,
} from "@utsukta/spa-core/module-registry";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import {
  layoutFor,
  pageLayoutFor,
  saveSlotLayout,
  editingWidgets,
  entryId,
  entryKey,
  entryConfig,
  makeInstanceKey,
  type LayoutEntry,
} from "@utsukta/spa-core/store/widget-layout";
import {
  templateEntriesFor,
  pageTemplateEntriesFor,
  saveTemplateSlots,
} from "@utsukta/spa-core/store/widget-templates";
import { toast } from "@utsukta/spa-core/store/toast";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { splitIntoColumns, useColumnCount } from "@utsukta/spa-core/lib/masonry";
import { useI18n } from "@utsukta/spa-core/i18n";
import WidgetArrangementEditor, {
  WidgetCard,
  WidgetPickerFooter,
  SlotRegionBox,
  widgetHelpTarget,
  type ResolvedEntry,
} from "./WidgetArrangementEditor";
import type { WidgetSlotName } from "@utsukta/spa-core/types/module.types";

const MAX_COLUMNS = 4;
const COLUMN_INDEXES = Array.from({ length: MAX_COLUMNS }, (_, i) => i);

interface SlotProps {
  name: WidgetSlotName;
  moduleId?: string;
  /** Allow the user to rearrange this slot while widget-edit mode is on. */
  editable?: boolean;
  /** When set, this slot's widgets come from the named layout template
   * instead of the module-level layout (see ModuleDef.pageTemplate) — the
   * item currently shown has been assigned this template. Widget eligibility
   * (isModuleActive/resolveModuleSlot/widgetAllowedIn) still uses moduleId;
   * only the override source changes. Editing here saves to the template
   * (saveTemplateSlots) instead of the page/module layout — since a
   * template can be assigned to multiple items, edits apply everywhere it's
   * used (see the "shared by N" notice in edit mode). */
  templateId?: string;
}

const Slot: Component<SlotProps> = (props) => {
  const location = useLocation();
  const installedApps = useInstalledApps();
  const viewerRole = useViewerRole();
  const auth = useAuth();
  const { t } = useI18n();

  const activeModuleId = () => {
    if (props.moduleId) return props.moduleId;
    return moduleIdForPath(location.pathname);
  };

  // On your own pages your layout applies; on someone else's channel pages
  // (and for visitors) the page owner's layout applies.
  const isPageOwner = () => viewerRole() === "owner";

  // Authenticated local user (any page) — widgets with visitorVisible: false
  // only render for these viewers
  const isLocalViewer = () => viewerRole() === "owner" || viewerRole() === "local";
  const visibleToViewer = (w: RegisteredWidget) => w.visitorVisible !== false || isLocalViewer();

  // auth() is undefined until the boot /spa/pconfig fetch lands, and until then
  // viewerRole() reports "anonymous" — which resolves the *page owner's* layout
  // instead of yours and drops every visitorVisible:false widget. Resolving
  // against that gives a hard load a different widget set than a client-side
  // navigation to the same page. Render nothing until the role is real.
  const authReady = () => auth() !== undefined;

  const widgetVersion = getWidgetVersion();
  // Reactive: re-derives when new modules register widgets after async import
  const globalWidgets = createMemo(() => {
    widgetVersion(); // track
    if (!authReady()) return [];
    return resolveGlobalSlots(props.name)
      .filter(visibleToViewer)
      .map((w) => ({ widget: w, Widget: getLazy(w.loader) }));
  });

  // Module-local widgets: the user's saved layout when one exists, otherwise
  // registry defaults. Stored entries that point at unknown, global, disallowed,
  // or uninstalled-app widgets are silently dropped — layouts outlive code.
  // Resolved entries are reference-stable across recomputes (keyed by instance
  // key + config) so <For> doesn't remount unchanged widgets.
  let entryCache = new Map<string, ResolvedEntry>();
  const localEntries = createMemo<ResolvedEntry[]>(() => {
    widgetVersion(); // track
    if (!authReady()) return [];
    const moduleId = activeModuleId();
    const apps = installedApps();
    if (!isModuleActive(moduleId, apps, disabledFrontendModules())) return [];

    const custom = props.templateId
      ? (isPageOwner() ? templateEntriesFor : pageTemplateEntriesFor)(props.templateId, props.name)
      : (isPageOwner() ? layoutFor(moduleId, props.name) : pageLayoutFor(moduleId, props.name));

    let resolved: ResolvedEntry[];
    if (custom) {
      resolved = [];
      const seen = new Set<string>();
      for (const entry of custom) {
        const w = getWidget(entryId(entry));
        if (
          !w ||
          w.global ||
          !widgetAllowedIn(w, moduleId) ||
          !isModuleActive(w.moduleId, apps, disabledFrontendModules()) ||
          !visibleToViewer(w) ||
          seen.has(entryKey(entry))
        ) continue;
        seen.add(entryKey(entry));
        resolved.push({ widget: w, key: entryKey(entry), config: entryConfig(entry) });
      }
    } else {
      resolved = resolveModuleSlot(props.name, moduleId)
        .filter((w) => isModuleActive(w.moduleId, apps, disabledFrontendModules()) && visibleToViewer(w))
        .map((w) => ({ widget: w, key: w.id }));
    }

    // Locked widgets are essential default content — force them back in if a
    // saved layout doesn't include them (e.g. saved before the widget
    // existed, or before it was marked locked).
    const present = new Set(resolved.map((e) => e.widget.id));
    for (const w of getAllWidgets()) {
      if (
        w.locked && !w.global && !present.has(w.id) &&
        widgetSlots(w).includes(props.name) &&
        w.defaultModules.includes(moduleId) &&
        isModuleActive(w.moduleId, apps, disabledFrontendModules()) &&
        visibleToViewer(w)
      ) {
        resolved.push({ widget: w, key: w.id });
      }
    }

    // Reuse previous entry objects when nothing about them changed
    const next = new Map<string, ResolvedEntry>();
    const out = resolved.map((e) => {
      const cacheKey = `${e.key}|${JSON.stringify(e.config ?? null)}`;
      const prev = entryCache.get(cacheKey);
      const stable = prev && prev.widget === e.widget ? prev : e;
      next.set(cacheKey, stable);
      return stable;
    });
    entryCache = next;
    return out;
  });

  // ── Edit mode ───────────────────────────────────────────────────────────────

  // Editing only applies to your own layout, on your own pages. When this
  // slot is templated, editing still applies here directly (same pencil,
  // same in-place UI as any module) — it just saves to the template.
  const editing = () => props.editable === true && editingWidgets() && isPageOwner();

  // Region label shown around the slot's boundary while editing — only the
  // slots that are ever actually editable need one.
  const slotLabel = () => {
    switch (props.name) {
      case "header": return t("widgets.slot_header");
      case "gridTop": return t("widgets.slot_gridtop");
      case "right": return t("widgets.slot_right");
      case "footer": return t("widgets.slot_footer");
      case "contentTop": return t("widgets.slot_content_top");
      default: return "";
    }
  };

  const persist = async (entries: LayoutEntry[] | null) => {
    const ok = props.templateId
      ? await saveTemplateSlots(props.templateId, props.name, entries ?? [])
      : await saveSlotLayout(activeModuleId(), props.name, entries);
    if (!ok) toast.error(t("widgets.save_failed"));
  };

  // The current arrangement in persistable form: plain id for singletons,
  // instance object otherwise
  const currentEntries = (): LayoutEntry[] =>
    localEntries().map((e) =>
      e.key === e.widget.id && e.config === undefined
        ? e.widget.id
        : { id: e.widget.id, key: e.key, ...(e.config !== undefined ? { config: e.config } : {}) },
    );

  const move = (index: number, delta: number) => {
    const entries = [...currentEntries()];
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    [entries[index], entries[target]] = [entries[target], entries[index]];
    void persist(entries);
  };

  const removeAt = (index: number) => {
    if (localEntries()[index]?.widget.locked) return;
    const entries = [...currentEntries()];
    entries.splice(index, 1);
    void persist(entries);
  };

  const addWidget = (w: RegisteredWidget) => {
    const entry: LayoutEntry = w.multiInstance
      ? { id: w.id, key: makeInstanceKey(w.id) }
      : w.id;
    void persist([...currentEntries(), entry]);
  };

  const saveConfig = (index: number, config: Record<string, unknown>) => {
    const entries = [...currentEntries()];
    const e = entries[index];
    if (e === undefined) return;
    entries[index] = { id: entryId(e), key: entryKey(e), config };
    void persist(entries);
    setConfigOpenKey(null);
  };

  // No "revert to default" concept once a slot belongs to a template — a
  // template is an explicit, non-default arrangement by design, and nothing
  // in WidgetTemplates.php ever un-sets a slot key back to "absent" once
  // saved (only to []). Removing widgets one at a time covers "make it empty".
  const isCustomised = () => !props.templateId && layoutFor(activeModuleId(), props.name) !== null;

  // Widgets the user could add here: same slot, allowed in this module,
  // backing app installed, not global, not already present (multiInstance
  // widgets stay available — each add creates a new instance)
  const availableWidgets = createMemo<RegisteredWidget[]>(() => {
    if (!editing()) return [];
    widgetVersion(); // track
    const moduleId = activeModuleId();
    const apps = installedApps();
    const present = new Set(localEntries().map((e) => e.widget.id));
    return getAllWidgets().filter(
      (w) =>
        !w.global &&
        widgetSlots(w).includes(props.name) &&
        (w.multiInstance === true || !present.has(w.id)) &&
        widgetAllowedIn(w, moduleId) &&
        isModuleActive(w.moduleId, apps, disabledFrontendModules()),
    );
  });

  const [pickerOpen, setPickerOpen] = createSignal(false);
  // Instance key of the entry whose config panel is open (one at a time)
  const [configOpenKey, setConfigOpenKey] = createSignal<string | null>(null);

  // gridTop is a banner strip, not a sidebar: lay its widgets out
  // masonry-style instead of stacking them full-width. A CSS grid would pad
  // every cell in a row up to its tallest neighbour — with widgets of very
  // different heights (a heatmap vs. a one-line quote, or a tall messages
  // panel vs. a short stats card) that reads as a grid full of dead space,
  // not a packed layout.
  //
  // Widgets are round-robin split across N flex columns — the same
  // left-to-right, top-to-bottom reading order the network module's
  // MasonryView uses — rather than CSS multi-column layout, which fills one
  // column fully before moving to the next (column-major, reads
  // top-to-bottom-then-wrap rather than left-to-right). Global and local
  // widgets are split independently, each keyed off its own stable array, so
  // a global widget's column never shifts (and it never remounts) when local
  // entries change on navigation.
  //
  // This split is used both browsing and editing, so the edit view previews
  // the same layout the visitor sees. In edit mode, cards still move via a
  // single flat order (move up/down shifts an entry's position in
  // localEntries, which is what the round-robin split assigns columns from)
  // — WidgetCard's index is derived with indexOf() rather than threaded
  // positionally, since column-splitting means a column's <For> no longer
  // sees each entry's place in the full list directly.
  //
  // header (above gridTop) and footer (below all page content) are always
  // full-width, single-column — for banner-like widgets (e.g. a horizontal
  // nav menu) that must span the whole row rather than pack into a column.
  //
  // All three need their own margin and a conditional wrapper (the
  // surrounding <main> has no space-y, unlike the sidebar <aside>). Other
  // slots return the bare content and rely on their parent's spacing.
  const isGridTop = props.name === "gridTop";
  const isFullWidth =
    props.name === "header" || props.name === "footer" || props.name === "contentTop";
  const hasContent = createMemo(
    () => globalWidgets().length > 0 || localEntries().length > 0 || editing(),
  );

  const [gridEl, setGridEl] = createSignal<HTMLDivElement>();
  const columnCount = isGridTop ? useColumnCount(gridEl, 16, MAX_COLUMNS) : () => 1;
  // Fixed set of column containers, hidden individually when they hold nothing.
  // columnCount() only decides how the entries are *distributed*; it must not
  // decide how many <div>s exist. It is derived from a ResizeObserver on the
  // grid element, which cannot exist until the slot has content, so it is
  // always 1 for the render that first mounts the grid and corrects to its
  // real value immediately after — and growing the outer <For>'s array in that
  // window left columns 1..n-1 out of the DOM until something else forced the
  // slot to re-render (e.g. navigating away and back).
  const columnIndexes = COLUMN_INDEXES;
  const columnHasContent = (i: number) =>
    (globalColumns()[i]?.length ?? 0) + (localColumns()[i]?.length ?? 0) > 0;
  const globalColumns = createMemo(() => splitIntoColumns(globalWidgets(), columnCount()));
  const localColumns = createMemo(() => splitIntoColumns(localEntries(), columnCount()));

  // Only built for isFullWidth / non-gridTop slots — kept as a function
  // rather than a value so gridTop slots (which never call it) don't pay for
  // constructing an unused, never-mounted reactive tree alongside the
  // column-split render below.
  const content = () => (
    <>
      {/* Always mounted — never torn down on module navigation */}
      <For each={globalWidgets()}>
        {(g) => (
          <div class="empty:hidden" use:helpable={widgetHelpTarget(g.widget)}>
            <g.Widget />
          </div>
        )}
      </For>

      {/* Swapped per active module */}
      <Show
        when={editing()}
        fallback={
          <For each={localEntries()}>
            {(entry) => {
              const Widget = getLazy(entry.widget.loader);
              return (
                <div class="empty:hidden" use:helpable={widgetHelpTarget(entry.widget)}>
                  <Widget config={entry.config} />
                </div>
              );
            }}
          </For>
        }
      >
        <WidgetArrangementEditor
          entries={localEntries()}
          availableWidgets={availableWidgets()}
          pickerOpen={pickerOpen()}
          onTogglePicker={() => setPickerOpen((o) => !o)}
          configOpenKey={configOpenKey()}
          onToggleConfig={(key) => setConfigOpenKey(configOpenKey() === key ? null : key)}
          onMove={move}
          onRemove={removeAt}
          onAdd={addWidget}
          onSaveConfig={saveConfig}
          onReset={isCustomised() ? () => void persist(null) : undefined}
        />
      </Show>
    </>
  );

  if (isFullWidth) {
    const marginClass = props.name === "footer" ? "mt-3" : "mb-4";
    return (
      <Show when={hasContent()}>
        <div class={marginClass}>
          <Show
            when={editing()}
            fallback={<div class="flex flex-col gap-4">{content()}</div>}
          >
            <SlotRegionBox label={slotLabel()}>
              <div class="flex flex-col gap-4">{content()}</div>
            </SlotRegionBox>
          </Show>
        </div>
      </Show>
    );
  }

  if (!isGridTop) {
    return (
      <Show when={editing()} fallback={content()}>
        <SlotRegionBox label={slotLabel()}>{content()}</SlotRegionBox>
      </Show>
    );
  }

  const globalColumnItems = (colIndex: number) => (
    <For each={globalColumns()[colIndex] ?? []}>
      {(g) => (
        <div class="mb-4" use:helpable={widgetHelpTarget(g.widget)}>
          <g.Widget />
        </div>
      )}
    </For>
  );

  return (
    <Show when={hasContent()}>
      <Show
        when={!editing()}
        fallback={
          <SlotRegionBox label={slotLabel()}>
            <div class="flex gap-4 items-start mb-4" ref={setGridEl}>
              <For each={columnIndexes}>
                {(colIndex) => (
                  <div
                    class="flex flex-col min-w-0"
                    classList={{ "flex-1": columnHasContent(colIndex), hidden: !columnHasContent(colIndex) }}
                  >
                    {globalColumnItems(colIndex)}
                    <For each={localColumns()[colIndex] ?? []}>
                      {(entry) => (
                        <WidgetCard
                          entry={entry}
                          index={() => localEntries().indexOf(entry)}
                          entriesLength={() => localEntries().length}
                          configOpenKey={configOpenKey()}
                          onToggleConfig={(key) => setConfigOpenKey(configOpenKey() === key ? null : key)}
                          onMove={move}
                          onRemove={removeAt}
                          onSaveConfig={saveConfig}
                          itemClass="mb-4"
                        />
                      )}
                    </For>
                  </div>
                )}
              </For>
            </div>
            <WidgetPickerFooter
              availableWidgets={availableWidgets()}
              pickerOpen={pickerOpen()}
              onTogglePicker={() => setPickerOpen((o) => !o)}
              onAdd={addWidget}
              onReset={isCustomised() ? () => void persist(null) : undefined}
            />
          </SlotRegionBox>
        }
      >
        <div class="flex gap-4 items-start mb-4" ref={setGridEl}>
          <For each={columnIndexes}>
            {(colIndex) => (
              <div
                class="flex flex-col min-w-0"
                classList={{ "flex-1": columnHasContent(colIndex), hidden: !columnHasContent(colIndex) }}
              >
                {globalColumnItems(colIndex)}
                <For each={localColumns()[colIndex] ?? []}>
                  {(entry) => {
                    const Widget = getLazy(entry.widget.loader);
                    return (
                      <div class="mb-4" use:helpable={widgetHelpTarget(entry.widget)}>
                        <Widget config={entry.config} />
                      </div>
                    );
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Show>
  );
};

export default Slot;
