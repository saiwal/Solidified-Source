import { type Component, type Accessor, type JSX, For, Show } from "solid-js";
import { getLazy, type RegisteredWidget } from "@utsukta/spa-core/module-registry";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  MdFillAdd,
  MdFillClose,
  MdFillKeyboard_arrow_up,
  MdFillKeyboard_arrow_down,
  MdFillRefresh,
  MdFillSettings,
} from "solid-icons/md";

// A layout entry resolved against the registry: the widget definition plus
// the instance key/config it is mounted with. Singleton widgets use their
// widget id as the key.
export interface ResolvedEntry {
  widget: RegisteredWidget;
  key: string;
  config?: Record<string, unknown>;
  /** Width in 12ths, for slots laid out as a grid. Absent = full width. */
  span?: number;
}

/** The widths offered in the edit-mode width picker. Kept in sync with the
 * `.slot-grid > [data-span=…]` rules in index.css — a span with no rule there
 * renders full width. */
export const SPAN_OPTIONS = [12, 6, 4, 3] as const;

export function widgetLabel(w: RegisteredWidget): string {
  return typeof w.label === "function" ? w.label() : w.label;
}

export function widgetHelpTarget(w: RegisteredWidget): string {
  return w.helpTarget ?? `widgets.${w.id}`;
}

const SPAN_LABELS: Record<number, "widgets.width_full" | "widgets.width_half" | "widgets.width_third" | "widgets.width_quarter"> = {
  12: "widgets.width_full",
  6: "widgets.width_half",
  4: "widgets.width_third",
  3: "widgets.width_quarter",
};

const editButtonClass =
  "p-1 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors " +
  "disabled:opacity-30 disabled:pointer-events-none";

// Labeled boundary drawn around an entire slot region while in edit mode, so
// adjacent regions (e.g. header vs. contentTop, both in the same column) stay
// visually distinguishable even when empty or holding a single widget.
// Deliberately a neutral dashed border, not the accent one WidgetCard uses —
// the two must never look interchangeable, since one means "this is a
// movable widget" and the other means "this is a slot boundary."
export const SlotRegionBox: Component<{ label: string; children: JSX.Element }> = (props) => (
  <div>
    <p class="text-[0.625rem] font-semibold uppercase tracking-widest text-muted mb-1.5">
      {props.label}
    </p>
    <div class="rounded-xl border border-dashed border-rim p-2 bg-accent-muted flex flex-col gap-4">
      {props.children}
    </div>
  </div>
);

interface WidgetCardProps {
  entry: ResolvedEntry;
  /** Position within the full (un-columnized) entries list — an accessor
   * since it may be derived (e.g. indexOf) rather than a stable index. */
  index: Accessor<number>;
  entriesLength: Accessor<number>;
  configOpenKey: string | null;
  onToggleConfig: (key: string) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onSaveConfig: (index: number, config: Record<string, unknown>) => void;
  /** Supplied only by slots that lay their widgets out in a grid — omitting it
   * hides the width picker entirely (the sidebar slots). */
  onSetSpan?: (index: number, span: number) => void;
}

// One editable widget card: label, configure/move/remove controls, optional
// config form, and an inert preview. Split out of WidgetArrangementEditor so
// index/entriesLength stay accessors rather than plain numbers so a card can
// be rendered from a derived position (indexOf) and still react correctly.
// In a grid slot the card itself is the grid item, so it carries data-span —
// edit mode then previews widths through the same CSS the live page uses.
const WidgetCard: Component<WidgetCardProps> = (props) => {
  const { t } = useI18n();
  const Widget = getLazy(props.entry.widget.loader);
  const configOpen = () => props.configOpenKey === props.entry.key;
  const ConfigForm = props.entry.widget.configComponent
    ? getLazy(props.entry.widget.configComponent)
    : null;

  return (
    <div
      class="rounded-xl border border-dashed border-accent/50 overflow-hidden"
      data-span={props.onSetSpan ? (props.entry.span ?? 12) : undefined}
      use:helpable={widgetHelpTarget(props.entry.widget)}
    >
      <div class="flex items-center justify-between gap-1 px-2 py-1 bg-elevated">
        <span class="text-xs font-medium truncate">{widgetLabel(props.entry.widget)}</span>
        <div class="flex items-center shrink-0">
          <Show when={props.onSetSpan}>
            {(onSetSpan) => (
              <select
                value={String(props.entry.span ?? 12)}
                onChange={(e) => onSetSpan()(props.index(), Number(e.currentTarget.value))}
                aria-label={t("widgets.widget_width")}
                title={t("widgets.widget_width")}
                class="mr-1 bg-surface border border-rim rounded-md px-1 py-0.5 text-[0.625rem] text-muted"
              >
                <For each={SPAN_OPTIONS}>
                  {(span) => <option value={String(span)}>{t(SPAN_LABELS[span])}</option>}
                </For>
              </select>
            )}
          </Show>
          <Show when={ConfigForm}>
            <button
              onClick={() => props.onToggleConfig(props.entry.key)}
              aria-expanded={configOpen()}
              aria-label={t("widgets.configure_widget")}
              title={t("widgets.configure_widget")}
              class={editButtonClass}
              classList={{ "text-accent": configOpen() }}
            >
              <MdFillSettings size={14} />
            </button>
          </Show>
          <button
            onClick={() => props.onMove(props.index(), -1)}
            disabled={props.index() === 0}
            aria-label={t("widgets.move_up")}
            title={t("widgets.move_up")}
            class={editButtonClass}
          >
            <MdFillKeyboard_arrow_up size={16} />
          </button>
          <button
            onClick={() => props.onMove(props.index(), 1)}
            disabled={props.index() === props.entriesLength() - 1}
            aria-label={t("widgets.move_down")}
            title={t("widgets.move_down")}
            class={editButtonClass}
          >
            <MdFillKeyboard_arrow_down size={16} />
          </button>
          <Show when={!props.entry.widget.locked}>
            <button
              onClick={() => props.onRemove(props.index())}
              aria-label={t("widgets.remove_widget")}
              title={t("widgets.remove_widget")}
              class={editButtonClass}
            >
              <MdFillClose size={14} />
            </button>
          </Show>
        </div>
      </div>

      {/* Per-instance settings form */}
      <Show when={configOpen() && ConfigForm}>
        {(Form) => {
          const F = Form();
          return (
            <div class="px-2 py-2 border-t border-rim">
              <F
                config={props.entry.config ?? {}}
                onSave={(config) => props.onSaveConfig(props.index(), config)}
              />
            </div>
          );
        }}
      </Show>

      {/* Inert preview — interacting with widgets is disabled while editing */}
      <div class="pointer-events-none opacity-60 p-1" aria-hidden="true">
        <Widget config={props.entry.config} />
      </div>
    </div>
  );
};

interface WidgetPickerFooterProps {
  availableWidgets: RegisteredWidget[];
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onAdd: (widget: RegisteredWidget) => void;
  /** Omit to hide the reset button entirely (e.g. templates have no "default" to revert to). */
  onReset?: () => void;
}

// The "add widget" picker + reset-layout button, full-width below the card
// list (and below any masonry columns) regardless of how the cards above it
// are laid out.
const WidgetPickerFooter: Component<WidgetPickerFooterProps> = (props) => {
  const { t } = useI18n();

  return (
    <div class="space-y-2">
      <button
        onClick={props.onTogglePicker}
        aria-expanded={props.pickerOpen}
        class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl
               border border-dashed border-rim rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400 hover:opacity-90 transition-opacity text-xs font-medium"
      >
        <MdFillAdd size={14} />
        {t("widgets.add_widget")}
      </button>

      <Show when={props.pickerOpen}>
        <Show
          when={props.availableWidgets.length > 0}
          fallback={<p class="text-xs text-muted px-1">{t("widgets.none_to_add")}</p>}
        >
          <div class="flex flex-col gap-1">
            <For each={props.availableWidgets}>
              {(widget) => (
                <button
                  onClick={() => props.onAdd(widget)}
                  class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-xs
                         bg-elevated border border-rim
                         hover:brightness-95 transition-all"
                >
                  <MdFillAdd size={12} class="shrink-0 text-muted" />
                  <span class="truncate">{widgetLabel(widget)}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={props.onReset}>
        {(onReset) => (
          <button
            onClick={() => onReset()()}
            class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl
                   text-xs font-medium text-muted
                   hover:text-txt hover:bg-elevated transition-colors"
          >
            <MdFillRefresh size={14} />
            {t("widgets.reset_layout")}
          </button>
        )}
      </Show>
    </div>
  );
};

interface WidgetArrangementEditorProps {
  entries: ResolvedEntry[];
  availableWidgets: RegisteredWidget[];
  pickerOpen: boolean;
  onTogglePicker: () => void;
  configOpenKey: string | null;
  onToggleConfig: (key: string) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  onAdd: (widget: RegisteredWidget) => void;
  onSaveConfig: (index: number, config: Record<string, unknown>) => void;
  /** Supplied only by grid-laid-out slots; forwarded to each card's width picker. */
  onSetSpan?: (index: number, span: number) => void;
  /** Omit to hide the reset button entirely (e.g. templates have no "default" to revert to). */
  onReset?: () => void;
}

// The editable widget-list UI shared by <Slot editable> (editing a page's own
// layout override) and the Layout Templates screen (editing a named,
// reusable template) — same move/remove/configure/add-widget/reset chrome,
// bound to whichever persistence the caller supplies via the callbacks. A
// single flat list of WidgetCard + WidgetPickerFooter; in the grid slots the
// cards are grid items and carry their own width (see data-span).
const WidgetArrangementEditor: Component<WidgetArrangementEditorProps> = (props) => {
  const { t } = useI18n();

  return (
    <>
      <Show when={props.entries.length === 0}>
        <p class="text-xs text-muted px-1">{t("widgets.empty_slot")}</p>
      </Show>

      <For each={props.entries}>
        {(entry, index) => (
          <WidgetCard
            entry={entry}
            index={index}
            entriesLength={() => props.entries.length}
            configOpenKey={props.configOpenKey}
            onToggleConfig={props.onToggleConfig}
            onMove={props.onMove}
            onRemove={props.onRemove}
            onSaveConfig={props.onSaveConfig}
            onSetSpan={props.onSetSpan}
          />
        )}
      </For>

      <WidgetPickerFooter
        availableWidgets={props.availableWidgets}
        pickerOpen={props.pickerOpen}
        onTogglePicker={props.onTogglePicker}
        onAdd={props.onAdd}
        onReset={props.onReset}
      />
    </>
  );
};

export default WidgetArrangementEditor;
