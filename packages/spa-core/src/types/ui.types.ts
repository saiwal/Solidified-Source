// The UI primitive contract. Modules import the primitives from `@ui/*`, and
// each theme aliases that to its own implementation (solidified: src/ui/) —
// so a Bootstrap or plain-CSS theme rewrites src/ui/, not every module.
// An implementation must accept every prop here and pass the rest through to
// the native element.
import type { JSX } from "solid-js";

/** One primary per view; ghost for labelled secondary actions; danger to confirm a destructive one. */
export type ButtonVariant = "primary" | "ghost" | "danger";
/** md is the full-size button; sm fits a dense row or a header. */
export type ButtonSize = "md" | "sm";

export interface ButtonProps extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Makes it an on/off toggle: renders aria-pressed and the "on" look when true. */
  pressed?: boolean;
}

export interface IconButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "title" | "aria-label" | "aria-pressed"> {
  /** Required: an icon-only button has no other accessible name. Used for both title and aria-label. */
  label: string;
  /** outline is the bordered header button; danger tints on hover. */
  variant?: "default" | "danger" | "outline";
  size?: ButtonSize;
  /** Set for toggles: renders aria-pressed and the "on" colour. */
  pressed?: boolean;
}

/**
 * An icon button that copies `value` and reports success: the icon becomes a
 * check for `timeout` ms, the accessible name switches to `copiedLabel`, and a
 * polite live region announces it. Clipboard failure goes to `onError`.
 */
export interface CopyButtonProps
  extends Omit<IconButtonProps, "label" | "onClick" | "value"> {
  /** Text to copy, or a getter for it (the value can change). */
  value: string | (() => string);
  /** Accessible name / tooltip while idle ("Copy address"). */
  label: string;
  /** Accessible name / live-region text after a successful copy ("Copied"). */
  copiedLabel: string;
  /** How long the copied state lasts, in ms (default 1500). */
  timeout?: number;
  onCopied?: () => void;
  onError?: (error: unknown) => void;
}

/** md for forms; sm for dense rows and widget config panels. */
export type FieldSize = "md" | "sm";

// `size` is also a native <input>/<select> attribute (visible width in
// characters); the contract takes the name over, so it's omitted here.
export interface InputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: FieldSize;
}

/**
 * A search control: bordered field + leading magnifier + a clear button while
 * there is a value. Enter calls `onSearch` when given; without it the field
 * submits its surrounding form normally. `label` is the field's accessible
 * name, `clearLabel` the clear button's.
 */
export interface SearchFieldProps
  extends Omit<InputProps, "type" | "value" | "onInput"> {
  value: string;
  onInput: (value: string) => void;
  label: string;
  clearLabel: string;
  onSearch?: (value: string) => void;
}

/**
 * A colour swatch that opens the platform colour picker. The native
 * `<input type="color">` stays (so the OS picker and keyboard work); it is
 * visually replaced by the swatch. `label` is both the picker's accessible name
 * and the visible text unless `showLabel` is false.
 */
export interface ColorSwatchProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  showLabel?: boolean;
  size?: "sm" | "md";
  class?: string;
}

/**
 * A drop target for files: click opens the file picker, drag-and-drop calls
 * `onFiles`. `label` names the picker; `hint` is the quiet second line.
 * Replaces hand-wired dragenter/dragover/drop + hidden-input blocks.
 */
export interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  label: string;
  hint?: JSX.Element;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  class?: string;
  /** Replace the default icon + label + hint content. */
  children?: JSX.Element;
}

export interface SelectProps extends Omit<JSX.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: FieldSize;
}

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: FieldSize;
}

/**
 * Label + control + hint/error. The implementation must associate the label
 * with the control inside it (for/id) and point the control's
 * aria-describedby at the hint or error, so call sites never pass ids.
 */
export interface FieldProps {
  label: JSX.Element;
  hint?: JSX.Element;
  /** Replaces the hint while set, and marks the control aria-invalid. */
  error?: string | false | null;
  /** md: text-sm label for forms; sm: small muted label for dense panels. */
  size?: FieldSize;
  class?: string;
  children: JSX.Element;
}

/**
 * An on/off switch. Must behave as a native checkbox inside a form: with a
 * `name` it submits `value` (default "1") when on and nothing when off.
 */
export interface SwitchProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "value" | "onChange"> {
  checked?: boolean;
  value?: string;
  /** Return a promise for an async toggle that can fail: once it settles the
   *  switch re-syncs to `checked`, so a refused change doesn't stay flipped. */
  onChange?: (checked: boolean) => void | Promise<unknown>;
  /** Accessible name when no visible label wraps the switch. */
  label?: string;
}

/** A labelled row: label + hint on the left, the switch on the right. */
export interface ToggleProps extends Omit<SwitchProps, "label"> {
  label: JSX.Element;
  hint?: JSX.Element;
}

/** A bordered panel. No padding or layout of its own — the call site sets those. */
export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Floats slightly above the page (a small shadow). */
  raised?: boolean;
}

/** The bar across the top of a Card: bottom rule, standard padding. */
export type CardHeaderProps = JSX.HTMLAttributes<HTMLDivElement>;

/**
 * A modal dialog layer (backdrop + top layer). Must trap focus, close on
 * Escape, make the page inert and restore focus to the opener — solidified
 * uses native <dialog>.showModal() for all of that.
 */
export interface ModalProps {
  onClose: () => void;
  /** Accessible name. Prefer `labelledBy` (or a ModalPanel `title`) when the panel shows a title. */
  label?: string;
  /** id of the element naming this dialog. */
  labelledBy?: string;
  /** Extra classes for the backdrop layer — z-index, padding, alignment. */
  class?: string;
  style?: JSX.CSSProperties;
  /** Default true. false where a stray click would lose input. */
  dismissOnBackdrop?: boolean;
  /** The caller owns the whole layout: position, size, dim, padding. */
  bare?: boolean;
  /** false renders a non-modal dialog: no focus trap, page stays interactive. */
  modal?: boolean;
  children?: JSX.Element;
}

export type ModalSize = "sm" | "md" | "lg" | "xl";

/** The dialog box inside a Modal. */
export interface ModalPanelProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Max width; omit to size it from `class`. */
  size?: ModalSize;
  /** Renders a header bar and names the dialog (no labelledBy needed). */
  title?: JSX.Element;
  /** A muted line under the title; becomes the dialog's description. */
  description?: JSX.Element;
  /** With `title`, adds a close button to the header. */
  onClose?: () => void;
  /** Renders a footer bar (right-aligned actions). */
  footer?: JSX.Element;
}

/** What a custom Menu trigger must spread onto its button. */
export interface MenuTriggerProps {
  ref: (el: HTMLElement) => void;
  onClick: (e?: MouseEvent) => void;
  "aria-haspopup": "menu";
  "aria-expanded": boolean;
}

/**
 * An action menu (⋯). Must render role="menu" with role="menuitem" items,
 * move focus with ArrowUp/ArrowDown/Home/End, and on Escape close and return
 * focus to the trigger. Not for picking a value — that is a select/listbox.
 */
export interface MenuProps {
  /** Accessible name of the default ⋯ trigger. */
  label: string;
  /** Replace the default ⋯ IconButton; spread `props` onto your button. */
  trigger?: (props: MenuTriggerProps, open: () => boolean) => JSX.Element;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Panel classes — usually a width (w-60). */
  class?: string;
  /** Fires on every open/close — e.g. to reset a sub-panel when the menu closes. */
  onOpenChange?: (open: boolean) => void;
  children: JSX.Element;
}

/**
 * A right-click menu over a region, with Menu's panel semantics. Must open at
 * the pointer on contextmenu, at the focused element for the keyboard's menu
 * key / Shift+F10, and on a touch long-press (iOS never fires contextmenu).
 * Every action in it must also be reachable another way — it is a shortcut.
 */
export interface ContextMenuProps {
  /** Accessible name of the panel. */
  label: string;
  /** The panel's MenuItems / MenuSeparators. */
  menu: JSX.Element;
  /** Panel classes — usually a width (w-60). */
  class?: string;
  /** Leave the browser's own menu alone (e.g. while editing text). */
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The region; it gets no wrapper box of its own (display: contents). */
  children: JSX.Element;
}

export type PopoverPlacement =
  | "top" | "top-start" | "top-end"
  | "bottom" | "bottom-start" | "bottom-end"
  | "left" | "left-start" | "left-end"
  | "right" | "right-start" | "right-end";

export interface PopoverTriggerProps {
  /** Spread onto the trigger element. */
  ref: (el: HTMLElement) => void;
  onClick: (e: MouseEvent) => void;
  "aria-expanded": boolean;
  "aria-controls": string;
  /** Derived from the panel role; absent for a plain disclosure. */
  "aria-haspopup"?: "dialog" | "listbox" | "menu";
}

/**
 * A click-to-open panel anchored to its trigger: Portal + floating placement,
 * outside-click/Escape dismissal, focus moved into the panel on open and back
 * to the trigger on Escape. Not a menu — use Menu for role="menu" arrow-key
 * behaviour; use Popover for a listbox, a form, or a plain disclosure.
 */
export interface PopoverProps {
  /** Render the trigger; spread `props` and use `open` for a pressed state. */
  trigger: (props: PopoverTriggerProps, open: () => boolean) => JSX.Element;
  /** Panel content; the function form receives `close()` for its actions. */
  children: JSX.Element | ((close: () => void) => JSX.Element);
  placement?: PopoverPlacement;
  /** Set when the content has listbox/menu/dialog semantics. */
  role?: "dialog" | "listbox" | "menu";
  /** Accessible name of the panel; required with `role`. */
  label?: string;
  /** Panel classes beyond the default surface — usually a width. */
  class?: string;
  onOpenChange?: (open: boolean) => void;
}

/**
 * A labelled text button that opens a Menu (button + chevron). A thin shell
 * over Menu, for the common "More actions" trigger; icon-only triggers keep
 * using Menu directly.
 */
export interface MenuButtonProps {
  /** Accessible name of the menu, and the visible label. */
  label: string;
  children: JSX.Element;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: JSX.Element;
  class?: string;
  /** Panel classes — usually a width (w-56). */
  menuClass?: string;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Hide the trailing chevron (default shows it). */
  chevron?: boolean;
}

/**
 * A hover/focus tip for a small trigger. Positioned by floating-ui in the top
 * layer; role="tooltip". Keep the content short (it is a hint, not a paragraph).
 */
export interface TooltipProps {
  content: string;
  placement?: PopoverPlacement;
  class?: string;
  children: JSX.Element;
}

export interface MenuItemProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: JSX.Element;
  danger?: boolean;
  /** Renders a link item instead of a button. */
  href?: string;
  /** "" downloads under the link's own filename. */
  download?: string;
  target?: string;
  rel?: string;
  /** Don't close on click — for an item wrapping a file input, which must stay
   *  mounted until its change event fires. Close from that handler instead. */
  keepOpen?: boolean;
}

export interface TabItem<T extends string> {
  value: T;
  label: JSX.Element;
  /** Decorative, before the label. */
  icon?: JSX.Element;
  /** A count bubble after the label; nothing at 0. */
  count?: number;
}

/**
 * A tab switcher (controlled). Must render role="tablist"/"tab" with
 * aria-selected, keep only the selected tab in the Tab order, and move the
 * selection with ArrowLeft/ArrowRight/Home/End.
 */
export interface TabsProps<T extends string> {
  /** Accessible name of the tablist. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  /** segmented: the header switcher pill group. underline: in-page sections. */
  variant?: "segmented" | "underline";
  /** Tabs share the full width equally (segmented only). */
  stretch?: boolean;
  /** Container classes — alignment such as mx-auto. */
  class?: string;
  /** Page-unique id; links each tab to the <TabPanel tabs={id}> showing it. */
  id?: string;
}

/**
 * The content under a Tabs. Must render role="tabpanel", labelled by its tab.
 * One panel whose contents follow the selection: pass the shown tab as value.
 */
export interface TabPanelProps<T extends string> {
  /** The id given to the Tabs. */
  tabs: string;
  value: T;
  class?: string;
  children: JSX.Element;
}

export interface CollapsibleTriggerProps {
  /** Spread onto every element that toggles the panel. */
  "aria-expanded": boolean;
  "aria-controls": string;
  onClick: () => void;
}

/**
 * A disclosure: the header render prop owns the row's markup (it may contain
 * links and buttons beside the toggle targets), and the panel unmounts while
 * closed. The header must spread the trigger props onto each toggle target, so
 * aria-expanded/aria-controls stay wired without hand-written ids.
 */
export interface CollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header: (props: CollapsibleTriggerProps) => JSX.Element;
  children: JSX.Element;
  class?: string;
  panelClass?: string;
}

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/** A busy indicator. Decorative (aria-hidden) unless given a `label`. */
export interface SpinnerProps {
  size?: SpinnerSize;
  /** Colour; default follows the surrounding text colour. */
  tone?: "current" | "accent" | "muted";
  /** Makes it a standalone role="status" loader with this accessible name. */
  label?: string;
  class?: string;
}

export type ProgressTone = "accent" | "success" | "warning" | "danger";

/**
 * A determinate or indeterminate progress bar. Named by `label` (role
 * progressbar); without one it is decorative (aria-hidden).
 */
export interface ProgressBarProps {
  /** 0..max; ignored when `indeterminate`. */
  value?: number;
  max?: number;
  tone?: ProgressTone;
  /** xs: a thin strip (2px); sm: 4px; md: 6px. */
  size?: "xs" | "sm" | "md";
  /** Accessible name. Required for a meaningful progressbar. */
  label?: string;
  indeterminate?: boolean;
  class?: string;
}

/**
 * A labelled metric card: a big number/JSX value, a quiet label, optional hint
 * and icon. `accent` marks an alerting value (queue > 0, failures).
 */
export interface StatProps {
  label: JSX.Element;
  /** A number (formatted with toLocaleString) or custom JSX. */
  value: number | JSX.Element;
  accent?: boolean;
  icon?: JSX.Element;
  hint?: JSX.Element;
  class?: string;
}

export type BadgeTone = "neutral" | "accent" | "danger" | "success" | "warning";

/** A small label chip: a tag, role or status. */
export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** sm: inline with metadata; md: alongside body text. */
  size?: "sm" | "md";
}

/** A solid unread/count bubble. Renders nothing at 0. */
export interface CountBadgeProps {
  n: number;
  /** Shows "max+" above this (default 99). */
  max?: number;
  /** Accessible text when the bare number isn't enough ("3 unread"). */
  label?: string;
  class?: string;
}

export type ChipTone = "neutral" | "accent" | "success" | "warning" | "danger";

/**
 * A compact filter/toggle chip: icon + label + optional count, with a selected
 * state. Must be a native button and render `aria-pressed` when the call site
 * gives `selected`; selected is the solid accent fill, distinct from the tone's
 * resting colour. For a static label use Badge; for a chip with a remove
 * affordance use RemovableChip (a chip containing a button cannot itself be a
 * button).
 */
export interface ChipProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  /** Selected/active state: renders aria-pressed and the solid accent fill. */
  selected?: boolean;
  tone?: ChipTone;
  /** sm: dense metadata rows; md: filter bars, matching Button size="sm". */
  size?: "sm" | "md";
  icon?: JSX.Element;
  /** A count after the label; nothing at 0. */
  count?: number;
  /**
   * The deterministic per-name colour used by tag/category clouds. Applies the
   * `.rainbow-pill` treatment and expects `--rainbow-h` on the element — spread
   * `rainbowStyle(name, true)` into `style` (the widgets already do).
   */
  rainbow?: boolean;
}

/**
 * A non-interactive chip with a trailing remove button. The chip itself must
 * not be a button (nested interactive elements are invalid markup and unreachable
 * by keyboard); the remove control is a real button named by `removeLabel`.
 */
export interface RemovableChipProps {
  children: JSX.Element;
  onRemove: () => void;
  /** Accessible name of the remove button ("Remove Alice"). */
  removeLabel: string;
  icon?: JSX.Element;
  tone?: ChipTone;
  size?: "sm" | "md";
  class?: string;
}

export type BannerTone = "info" | "success" | "warning" | "danger";

/**
 * An inline status banner: a tone-tinted box with an optional icon, title,
 * body and actions. Renders role="status" by default; use role="alert" for an
 * error the user must not miss. A theme must keep the role/live region.
 */
export interface BannerProps {
  tone?: BannerTone;
  icon?: JSX.Element;
  title?: JSX.Element;
  /** Buttons/links on the right (a link styled with buttonClass is fine). */
  actions?: JSX.Element;
  role?: "status" | "alert";
  class?: string;
  children?: JSX.Element;
}

/**
 * A loading placeholder block. Decorative and hidden from assistive tech; if
 * the wait itself needs announcing, put a labelled `role="status"` wrapper
 * around the skeleton group instead of labelling each block.
 */
export interface SkeletonProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Corner shape; token-based, so the corner-radius setting applies. */
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
  /** Surface contrast. Default elevated. */
  tone?: "elevated" | "overlay" | "surface";
  /** Turn the pulse off where an ancestor already animates. */
  pulse?: boolean;
}

/** A paragraph of skeleton lines; the last one is shorter. */
export interface SkeletonTextProps {
  /** Number of lines (default 3). */
  lines?: number;
  tone?: SkeletonProps["tone"];
  size?: "sm" | "md";
  class?: string;
}

/**
 * A person's/channel's picture. Must fall back to the name's initials when
 * there is no `src` *or* the image fails to load (federated photo URLs die).
 */
export interface AvatarProps extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> {
  src?: string | null;
  /** Source of the fallback initials and colour. */
  name?: string;
  /** Width/height in Tailwind spacing units: 8 = w-8 (2rem). Default 8. */
  size?: number;
  shape?: "circle" | "rounded";
  /** Accessible name; omit when the name is printed beside it (the usual case). */
  alt?: string;
}

/** "Nothing here" message for an empty list, folder or page. */
export interface EmptyStateProps {
  /** Large faded icon above the message. */
  icon?: JSX.Element;
  /** A button or link below the message ("Create your first page"). */
  action?: JSX.Element;
  /** sm: inside a list or panel; md: a whole view. */
  size?: "sm" | "md";
  class?: string;
  children: JSX.Element;
}

/**
 * A compact row: leading avatar/icon, title, optional subtitle/meta, trailing
 * control. Renders a link when `href`, a button when `onClick`, else a plain
 * row. For dense multi-column data use DataTable.
 */
export interface ListRowProps {
  leading?: JSX.Element;
  title: JSX.Element;
  subtitle?: JSX.Element;
  /** Small quiet line under the title (a date, count or address). */
  meta?: JSX.Element;
  /** Right-aligned slot (badge, action, chevron). */
  trailing?: JSX.Element;
  href?: string;
  onClick?: () => void;
  class?: string;
}

/**
 * The tail of a paginated list: a load-more button, or an auto-loading sentinel
 * (`auto`) for feed-style scrolling. Renders nothing once `hasMore` is false.
 */
export interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
  label: string;
  /** Label while a page is in flight (default: the idle label). */
  loadingLabel?: string;
  /** Auto-load when the sentinel enters the viewport instead of showing a button. */
  auto?: boolean;
  class?: string;
}

/**
 * A sheet: a panel attached to a viewport edge (a right drawer, a mobile bottom
 * sheet). Built on Modal, so it keeps the native <dialog> focus trap, Escape,
 * inert page and focus restore. The caller mounts it with `<Show when={open}>`.
 */
export interface SheetProps {
  onClose: () => void;
  /** Accessible name of the sheet. */
  label: string;
  side?: "right" | "left" | "bottom";
  /** Panel classes — padding, internal layout. */
  class?: string;
  children: JSX.Element;
}

export interface DataTableColumn<T> {
  /** Stable column id, also the sort key when `sortable`. */
  key: string;
  /** Plain text: it is repeated as the inline label once rows fold. "" = no label (an actions column). */
  header: string;
  /** Cell renderer. */
  cell: (row: T) => JSX.Element;
  /** Sort this column; header becomes a button. */
  sortable?: boolean;
  /** Fixed width in rem, padding included. Absent = shares the spare width (at least 10rem). */
  width?: number;
  /** Classes on the cell (alignment, `truncate`, text colour). */
  class?: string;
}

/**
 * A sortable table. `sort` is controlled: the call site owns the key/direction
 * and re-sorts `rows`; the header renders aria-sort and calls `onSort`.
 *
 * Never hides a column or scrolls sideways: once the container is narrower
 * than the columns' widths, the header row hides and each row folds — the
 * first column and any unlabelled (actions) column on the top line, the rest
 * wrapping beneath as `label value` pairs. Folded, there is no header to sort by.
 */
export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  /** Row click (makes each row a button-like target). */
  onRowClick?: (row: T) => void;
  empty?: JSX.Element;
  class?: string;
}

/**
 * A load failure: role="alert" message, optional muted detail and a retry
 * button. Use EmptyState for "nothing here"; this is for "it didn't load".
 */
export interface ErrorStateProps {
  /** The headline, e.g. "Couldn't load files". */
  message: JSX.Element;
  /** Smaller muted second line — the API/exception text. */
  detail?: JSX.Element;
  retry?: () => void;
  /** Label of the retry button (default "Retry"). */
  retryLabel?: string;
  icon?: JSX.Element;
  class?: string;
}
