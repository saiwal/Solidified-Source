/**
 * modal-host.ts
 *
 * The open-composer registry. Composers used to be mounted by whichever widget
 * or view opened them, behind a local `createSignal` — so navigating away
 * unmounted the composer mid-draft. They are mounted by `ModalHost` (in
 * Layout) instead, which lives outside the routed tree and therefore outlives
 * navigation.
 *
 * Pattern copied from `store/share.ts` + `views/ShareModalHost.tsx`.
 *
 * Imports stay node-resolvable, deliberately: node runs modal-host.test.ts
 * against the real module, so nothing here may use the `@/` alias or a
 * relative import without a `.ts` extension. `@utsukta/spa-core/*` is fine —
 * node follows the workspace symlink and the package's exports map. That is
 * also why resetting zen lives in ModalHost's frame wrapper rather than
 * here.
 */
import { createContext, createSignal, type Accessor, type Setter } from "solid-js";
// Package import, not the "@/" alias: node resolves it through the workspace
// symlink + exports map, so modal-host.test.ts still runs.
import { persistedSignal, oneOf } from "@utsukta/spa-core/lib/persisted";

/**
 * - `modal` — the centred dialog, unchanged from before this existed.
 * - `dock`  — Gmail-style panel pinned bottom-right; the page stays usable.
 * - `page`  — clean viewport takeover, like the webpage/wiki editors.
 * - `min`   — collapsed to a pill in the dock strip. The composer stays
 *             MOUNTED (wrapper gets `hidden`), so caret, undo history and
 *             in-flight uploads survive.
 */
export type ComposerMode = "modal" | "dock" | "page" | "min";

/**
 * Which mode a composer opens in when the opener doesn't name one (none do).
 * User preference, Settings → Display; "min" is not offerable — a composer that
 * opened as a pill would look like nothing happened.
 */
export const [defaultComposerMode, setDefaultComposerMode] = persistedSignal<
  Exclude<ComposerMode, "min">
>("hz-composer-mode", "modal", oneOf("modal", "dock", "page"));

/** Same, for an opened post (Settings → Display, separate from composers). */
export const [defaultPostMode, setDefaultPostMode] = persistedSignal<
  Exclude<ComposerMode, "min">
>("hz-post-mode", "modal", oneOf("modal", "dock", "page"));

const defaultModeFor = (kind: ComposerKind) =>
  kind === "thread" ? defaultPostMode() : defaultComposerMode();

export const isExpanded = (m: ComposerMode) => m !== "min";

/** The minimum shape the invariants need — a real entry has more. */
export interface ModeHolder {
  id: string;
  /** The composer's draft scope ("post:new", "article:<uuid>"). */
  scope: string;
  mode: () => ComposerMode;
  setMode: (m: ComposerMode) => void;
  /** Which mode a pill click returns to. Plain field: read once, on click. */
  restoreTo?: ComposerMode;
}

/**
 * A composer is identified by its draft scope, not by its callsite. Two entries
 * on one scope would share `draft:${scope}` in IDB and the same attachment
 * store, and would silently overwrite each other's autosave — so reopening a
 * scope has to find the live composer instead of making a second one.
 */
export function findByScope<T extends { scope: string }>(
  list: readonly T[],
  scope: string,
): T | undefined {
  return list.find((e) => e.scope === scope);
}

/** How many docked panels fit along the bottom-right rail. */
export const MAX_DOCKED = 2;

function minimize(e: ModeHolder): void {
  if (!isExpanded(e.mode())) return;
  e.restoreTo = e.mode();
  e.setMode("min");
}

/**
 * Re-establishes the coexistence rules around whichever entry just changed.
 *
 * Modal and page take over the screen, so they stay exclusive — everything else
 * drops to a pill. Docked panels are non-blocking and sit side by side up to
 * MAX_DOCKED, oldest minimized first once the rail is full.
 *
 * Exclusivity for modal/page is not cosmetic: `zen.ts` is a global signal that
 * assumes one live composer, which is why RichEditor only offers the zen toggle
 * outside dock mode.
 */
export function enforceModeRules(list: readonly ModeHolder[], id: string): void {
  const target = list.find((e) => e.id === id);
  if (!target || !isExpanded(target.mode())) return;

  if (target.mode() !== "dock") {
    for (const e of list) if (e.id !== id) minimize(e);
    return;
  }

  // A docked panel evicts a screen-filling one, but tolerates other docks.
  for (const e of list) if (e.id !== id && e.mode() !== "dock") minimize(e);

  // Keep the newest MAX_DOCKED - 1 others; entries are in creation order.
  const others = list.filter((e) => e.id !== id && e.mode() === "dock");
  for (const e of others.slice(0, Math.max(0, others.length - (MAX_DOCKED - 1)))) {
    minimize(e);
  }
}

/** Kinds the host knows how to mount — see ModalHost's component map. */
/** `thread` is not a composer: an opened post (PostDetailModal), hosted here so
 *  it gets the same dock/page/min modes and survives navigation. */
/** `event` is EventCreatorModal — a form with no autosaved draft; minimizing it
 *  keeps it mounted, which is all the state it has. */
export type ComposerKind = "post" | "dm" | "article" | "card" | "note" | "thread" | "event";

/**
 * Provided per entry by `ModalHost`. Absent for the callsites that still
 * mount a composer themselves, which is what keeps `ComposerModal` backwards
 * compatible: no context means exactly the pre-existing modal behaviour, and
 * migrating an entry point to the host is opt-in.
 */
export interface ComposerFrame {
  /** What is being written, so the chrome can label and badge it. */
  kind: ComposerKind;
  mode: Accessor<ComposerMode>;
  setMode: (m: ComposerMode) => void;
  /** The composer's own title field, so a pill can name what is in it. */
  setDocTitle: (title: string) => void;
  /** Slot on the bottom-right rail, 0 = rightmost. Only meaningful docked. */
  dockIndex: Accessor<number>;
}

export const ComposerFrameContext = createContext<ComposerFrame | undefined>(undefined);

export interface ComposerEntry extends ModeHolder {
  kind: ComposerKind;
  /** Fallback pill label ("New Post") when the composer has no title yet. */
  title: string;
  /** The composer's live title field — pushed up by createComposerStore. */
  docTitle: Accessor<string>;
  setDocTitle: Setter<string>;
  /** Handed to the composer component as-is. */
  props: Record<string, unknown>;
  /** Per-entry signal — see the note on setComposerMode. */
  mode: Accessor<ComposerMode>;
  setMode: Setter<ComposerMode>;
}

export interface OpenComposerSpec {
  kind: ComposerKind;
  /** Must match the draft scope the composer itself derives (see findByScope). */
  scope: string;
  title: string;
  props: Record<string, unknown>;
  mode?: ComposerMode;
}

const [entries, setEntries] = createSignal<ComposerEntry[]>([]);

/** Every live composer, expanded or minimized. */
export const composerEntries = entries;

let seq = 0;

/**
 * Open a composer, or focus the one already editing this scope.
 *
 * The returned id is stable for the composer's whole life, across mode changes.
 */
export function openComposer(spec: OpenComposerSpec): string {
  const existing = findByScope(entries(), spec.scope);
  if (existing) {
    // Reopening an active scope must not create a second composer on the same
    // draft key; surface the live one instead, with whatever it already holds.
    // Already expanded means "bring it forward", not "resize it" — clicking
    // New Post again should not yank a docked composer back into a modal.
    setComposerMode(
      existing.id,
      spec.mode ??
        (isExpanded(existing.mode())
          ? existing.mode()
          : (existing.restoreTo ?? defaultModeFor(existing.kind))),
    );
    return existing.id;
  }

  const [mode, setMode] = createSignal<ComposerMode>(spec.mode ?? defaultModeFor(spec.kind));
  const [docTitle, setDocTitle] = createSignal("");
  const entry: ComposerEntry = {
    id: `composer-${++seq}`,
    scope: spec.scope,
    kind: spec.kind,
    title: spec.title,
    props: spec.props,
    mode,
    setMode,
    docTitle,
    setDocTitle,
  };
  // Only ever append/filter this array. Rebuilding an entry object (a
  // `prev.map(e => ({ ...e }))`) changes its identity, and <For> keys on
  // identity — every composer would remount and lose its editor state.
  const next = [...entries(), entry];
  setEntries(next);
  enforceModeRules(next, entry.id);
  return entry.id;
}

/**
 * `mode` is a per-entry signal rather than a field on the entry, so flipping it
 * leaves the array identity alone: `<For>` never re-creates the row, and the
 * mounted composer keeps its caret, undo history and in-flight uploads.
 */
export function setComposerMode(id: string, mode: ComposerMode): void {
  const list = entries();
  const entry = list.find((e) => e.id === id);
  if (!entry) return;
  // Only stamp restoreTo on the way down from an expanded mode — minimizing an
  // already-minimized entry would otherwise record "min" as what to restore to,
  // and its pill would stop opening.
  if (mode === "min" && isExpanded(entry.mode())) entry.restoreTo = entry.mode();
  entry.setMode(mode);
  if (mode !== "min") enforceModeRules(list, id);
}

/** Restore a minimized composer to whatever it was before. */
export function restoreComposer(id: string): void {
  const entry = entries().find((e) => e.id === id);
  if (entry) setComposerMode(id, entry.restoreTo ?? defaultModeFor(entry.kind));
}

/**
 * Open a post's thread view, or bring forward the one already showing it.
 * `props` go to PostDetailModal as-is — an `onClose` there runs before the
 * entry leaves (see ModalHost's `after`). Feed `handlers` are deliberately not
 * accepted: they close over a feed store that dies on navigation.
 */
export function openPost(uuid: string, props: Record<string, unknown> = {}): string {
  return openComposer({ kind: "thread", scope: `thread:${uuid}`, title: "", props: { ...props, uuid } });
}

/**
 * Open the event creator — `props.event` set means edit. Scope matches the
 * creator's own attachment store key, so reopening surfaces the live form.
 * `onCreated`/`onEdited` run before the entry leaves, as with every composer.
 */
export function openEvent(props: Record<string, unknown> & { event?: { id: string | number } } = {}): string {
  return openComposer({
    kind: "event",
    scope: `event:${props.event?.id ?? "new"}`,
    title: "",
    props,
  });
}

export function closeComposer(id: string): void {
  setEntries(entries().filter((e) => e.id !== id));
}
