import { type Component } from "solid-js";

export type NavContext =
  | "owner"
  | "local"
  | "remote"
  | "anonymous"
  | "all"
  | "admin";

export interface NavItemDef {
  label: string | (() => string);
  icon: string;
  path: string;
  href: string | (() => string);
  context?: NavContext | NavContext[]; // single or array of allowed roles
  hidden?: boolean;
  /**
   * Help-mode target for this nav item, in "nav.<topic>" form. Resolved the
   * same way as the `use:helpable` directive: fetches src/docs/user/en/nav.md
   * and extracts the "## <topic>" heading (underscores become spaces). Falls
   * back to a topic derived from the item's path when unset — see
   * `navItemHelpTarget()` in `useNav.ts`.
   */
  helpTarget?: string;
}

type SlotLoader = () => Promise<{ default: Component }>;

export type ComponentLoader<P extends Record<string, any> = {}> = () => Promise<{ default: Component<P> }>;

export type WidgetSlotName = "right" | "leftBottom" | "rightVisitor" | "header" | "footer" | "contentTop";

/** Props every widget component is mounted with. */
export interface WidgetProps {
  /** Per-instance settings for multiInstance widgets; absent for singletons. */
  config?: Record<string, unknown>;
}

/** Props for a widget's configComponent (shown in the edit-mode config panel). */
export interface WidgetConfigProps {
  config: Record<string, unknown>;
  /** Persist the instance config. The panel closes on success. */
  onSave: (config: Record<string, unknown>) => void;
}

export interface WidgetDef {
  /** Stable identifier, persisted in user layouts — never rename once shipped. Convention: "<moduleId>.<name>". */
  id: string;
  /** Human-readable name for the widget picker UI. */
  label: string | (() => string);
  loader: ComponentLoader<WidgetProps>;
  /** Single slot, or a list to mount the same widget in several slots at once. */
  slot: WidgetSlotName | WidgetSlotName[];
  /** Module ids where the widget appears out of the box. Defaults to the registering module. */
  defaultModules?: string[];
  /**
   * Width in twelfths this widget takes in the grid slots (header/contentTop/
   * footer) when the user hasn't chosen one — e.g. 4 for a third. Only the
   * widths with a rule in index.css (6/4/3) do anything; anything else, and
   * the default, is full width. A user-set span always wins.
   */
  defaultSpan?: number;
  /** Module ids where the widget can be placed by the user, or "any". Defaults to defaultModules. */
  contexts?: string[] | "any";
  /** Always mounted regardless of active module; never torn down on navigation. */
  global?: boolean;
  /**
   * true = essential default content for its module — still reorderable, but
   * the edit-mode remove button is hidden, and `<Slot>` re-adds it if a saved
   * layout doesn't include it (e.g. a layout saved before the widget existed
   * or before it was marked locked). Only meaningful on a widget whose
   * `defaultModules` already covers the module it should be locked in — it is
   * not force-added anywhere else. Ignored on `global` widgets. Default false.
   */
  locked?: boolean;
  /**
   * false = only rendered for authenticated local users. Set on widgets that
   * show viewer-private data (drafts, bookmarks) so visitors to public pages
   * never mount them. Default true.
   */
  visitorVisible?: boolean;
  /**
   * true = the widget may be placed several times in the same slot; each
   * placement is an instance with its own key and config. The picker keeps
   * offering the widget when instances are already present.
   */
  multiInstance?: boolean;
  /**
   * Settings form rendered in the edit-mode config panel of each instance.
   * Receives the current config and an onSave callback.
   */
  configComponent?: ComponentLoader<WidgetConfigProps>;
  /**
   * Help-mode target for this widget, in "<docModule>.<section>" form (section
   * optional — omit it to show the whole doc). Resolved the same way as the
   * `use:helpable` directive: fetches src/docs/user|dev/en/<docModule>.md and,
   * if a section is given, extracts the "## <section>" heading (underscores
   * become spaces). Falls back to `widgets.<id>` when unset.
   */
  helpTarget?: string;
}

/** @deprecated Use ModuleDef.widgets instead. Ignored by the registry. */
export interface SlotsDef {
  right?: SlotLoader | SlotLoader[];
  leftBottom?: SlotLoader | SlotLoader[];
  rightVisitor?: SlotLoader | SlotLoader[];
 help?: () => Promise<{ default: Component }>;
}

export interface ModuleDef {
  id: string;
  routes: RouteDef[];
  navItem?: NavItemDef;
  /** @deprecated Use widgets instead. Ignored by the registry. */
  slots?: SlotsDef;
  widgets?: WidgetDef[];
  permissions?: string[];
  /** Stable URL path fragment from the app's .apd (e.g. "/articles/"). If set, module only
   * renders when an installed app's url contains this fragment. (Matched on url, not the
   * app's display name, because app_name can be a stale translated string on old channels.) */
  appUrlSlug?: string;
  /** Marks a module as a pure-frontend feature with no backing Hubzilla app.
   * Shows up as a toggleable entry in Settings → Integrations and is gated the
   * same way as appUrlSlug-gated modules (isModuleActive/ModuleGuard/Slot), keyed
   * off a pconfig list instead of the installed-apps set. */
  frontendFeature?: {
    label: string | (() => string);
    description?: string | (() => string);
    /** false = off until the user enables it in Settings → Integrations. Defaults to true. */
    defaultEnabled?: boolean;
  };
  /** true = only rendered for authenticated users; anonymous visitors are redirected to /login. */
  requiresAuth?: boolean;
  /** Reactive accessor for the layout-template id assigned to the item
   * currently shown by this module's active route (e.g. a webpage's assigned
   * template), if any. When set, `<Slot templateId>` resolves that slot's
   * widgets from the named template instead of the module-level layout.
   * Omit/return null|undefined to use the module-level layout as normal. */
  pageTemplate?: () => string | null | undefined;
  /** Reactive accessor for the chrome mode
   * ("default"|"zen"|"focus"|"wide"|"compact") of the item currently shown
   * by this module's active route (e.g. a webpage's assigned template's
   * chrome setting). "zen" hides all app chrome (nav, sidebars, widget
   * slots, mobile bars), leaving only the routed page's own content.
   * "focus" hides only the nav rail/sidebars/mobile bars, keeping
   * header/contentTop/footer widgets visible on the page. "wide"
   * hides only the right widget sidebar. "compact" hides the nav rail and
   * mobile drawer/tab bar. Omit/return undefined (or "default") for normal
   * chrome. */
  pageChrome?: () => "default" | "zen" | "focus" | "wide" | "compact" | undefined;
}

export interface RouteDef {
  path: string;
  component: () => Promise<{ default: Component }>;
  /** Set automatically by registerModule — do not supply manually. */
  moduleId?: string;
}
