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
  entrySpan,
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
import { rowSpan } from "@utsukta/spa-core/lib/masonry";
void rowSpan;
import { useI18n } from "@utsukta/spa-core/i18n";
import WidgetArrangementEditor, {
  SlotRegionBox,
  widgetHelpTarget,
  type ResolvedEntry,
} from "./WidgetArrangementEditor";
import type { WidgetSlotName } from "@utsukta/spa-core/types/module.types";

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
        resolved.push({
          widget: w,
          key: entryKey(entry),
          config: entryConfig(entry),
          span: entrySpan(entry),
        });
      }
    } else {
      resolved = resolveModuleSlot(props.name, moduleId)
        .filter((w) => isModuleActive(w.moduleId, apps, disabledFrontendModules()) && visibleToViewer(w))
        .map((w) => ({ widget: w, key: w.id, span: w.defaultSpan }));
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
        resolved.push({ widget: w, key: w.id, span: w.defaultSpan });
      }
    }

    // Reuse previous entry objects when nothing about them changed
    const next = new Map<string, ResolvedEntry>();
    const out = resolved.map((e) => {
      const cacheKey = `${e.key}|${JSON.stringify(e.config ?? null)}|${e.span ?? ""}`;
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
      case "contentTop": return t("widgets.slot_content_top");
      case "right": return t("widgets.slot_right");
      case "footer": return t("widgets.slot_footer");
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
      e.key === e.widget.id && e.config === undefined && e.span === undefined
        ? e.widget.id
        : {
            id: e.widget.id,
            key: e.key,
            ...(e.config !== undefined ? { config: e.config } : {}),
            ...(e.span !== undefined ? { span: e.span } : {}),
          },
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

  // Width in 12ths for the grid-laid-out slots. Full width is the default, so
  // it is stored as the absence of a span rather than as span: 12 — which lets
  // a plain-string singleton entry collapse back to a string.
  const setSpan = (index: number, span: number) => {
    const entries = [...currentEntries()];
    const e = entries[index];
    if (e === undefined) return;
    const cfg = entryConfig(e);
    entries[index] = {
      id: entryId(e),
      key: entryKey(e),
      ...(cfg !== undefined ? { config: cfg } : {}),
      ...(span !== 12 ? { span } : {}),
    };
    void persist(entries);
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

  // header, contentTop and footer are laid out as a 12-column grid: each
  // widget is full-width unless its layout entry (or the widget's own
  // defaultSpan) gives it a narrower span. All three need their own margin
  // and a conditional wrapper — the surrounding <main> has no space-y, unlike
  // the sidebar <aside>. Other slots return the bare content and rely on
  // their parent's spacing.
  const isFullWidth =
    props.name === "header" || props.name === "contentTop" || props.name === "footer";
  const hasContent = createMemo(
    () => globalWidgets().length > 0 || localEntries().length > 0 || editing(),
  );

  // Masonry packing only buys something when an item is narrower than full
  // width; a slot of full-width items packs identically without it, and the
  // 1px-row span it relies on is unreliable for an item that grows without
  // bound (an infinite feed) — see .slot-grid-packed in index.css. Edit mode
  // always packs: the arrangement cards carry their own spans.
  const packed = createMemo(
    () => editing() || localEntries().some((e) => (e.span ?? 12) < 12),
  );
  const gridClass = () =>
    `slot-grid ${packed() ? "slot-grid-packed " : ""}grid grid-cols-12 gap-4 items-start`;

  const content = () => (
    <>
      {/* Always mounted — never torn down on module navigation */}
      <For each={globalWidgets()}>
        {(g) => (
          <div
            class="empty:hidden"
            use:rowSpan={isFullWidth ? 16 : undefined}
            use:helpable={widgetHelpTarget(g.widget)}
          >
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
                <div
                  class="empty:hidden"
                  data-span={entry.span ?? 12}
                  use:rowSpan={isFullWidth ? 16 : undefined}
                  use:helpable={widgetHelpTarget(entry.widget)}
                >
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
          onSetSpan={isFullWidth ? setSpan : undefined}
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
            fallback={<div class={gridClass()}>{content()}</div>}
          >
            <SlotRegionBox label={slotLabel()}>
              <div class={gridClass()}>{content()}</div>
            </SlotRegionBox>
          </Show>
        </div>
      </Show>
    );
  }

  return (
    <Show when={editing()} fallback={content()}>
      <SlotRegionBox label={slotLabel()}>{content()}</SlotRegionBox>
    </Show>
  );
};

export default Slot;
