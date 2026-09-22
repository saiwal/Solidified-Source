/**
 * ModalHost.tsx
 *
 * Mounts every open composer, once, from Layout — outside the routed tree, so a
 * composer survives navigation. Same host pattern as ShareModalHost.
 *
 * Two things make the survival work:
 *  - `<For>` is keyed by entry reference and an entry's `mode` is its own signal,
 *    so switching modal/dock/page/min never re-creates the row. A remount would
 *    take RichEditor's contenteditable, caret and undo history with it.
 *  - it renders `open={true}` permanently; visibility belongs to ComposerModal's
 *    mode classes now, not to the composer's own `<Show when={props.open}>`.
 */
import { For, Show, createEffect, createSignal, lazy, on, type Component } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { useI18n } from "@utsukta/spa-core/i18n";
import { setZenMode } from "@utsukta/spa-core/store/zen";
import {
  ComposerFrameContext,
  closeComposer,
  composerEntries,
  restoreComposer,
  setComposerMode,
  type ComposerEntry,
  type ComposerKind,
} from "./modal-host";
import { ComposerKindIcon } from "@/shared/editor/components/ComposerModal";
import { MdOutlineClose } from "solid-icons/md";
import { createPopover } from "@/shared/stream/filters/createPopover";


const PostComposer = lazy(() => import("@/shared/editor/composers/PostComposer"));
const DMComposer = lazy(() => import("@/shared/editor/composers/DMComposer"));
const ArticleComposerModal = lazy(() => import("@/shared/editor/composers/ArticleComposerModal"));
const CardComposerModal = lazy(() => import("@/shared/editor/composers/CardComposerModal"));
const NoteComposerModal = lazy(() => import("@/shared/editor/composers/NoteComposerModal"));
const PostDetailModal = lazy(() => import("./PostDetailModal"));
const EventCreatorModal = lazy(() => import("@/modules/calendar/widgets/EventCreatorModal"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BY_KIND: Record<ComposerKind, Component<any>> = {
  post: PostComposer,
  dm: DMComposer,
  article: ArticleComposerModal,
  card: CardComposerModal,
  note: NoteComposerModal,
  thread: PostDetailModal,
  event: EventCreatorModal,
};

/**
 * A composer now outlives the view that opened it, so an `onSaved`/`onPosted`
 * closure can run against a disposed owner. Its API work has already happened
 * by then; only the caller's own refetch can be a no-op. Prefer the global
 * refresh signals (bumpDraftsVersion, queryClient.invalidateQueries) in props
 * passed to openComposer — this guard is for the rest.
 */
function guard<T extends unknown[]>(fn: unknown): ((...a: T) => void) | undefined {
  if (typeof fn !== "function") return undefined;
  return (...args: T) => {
    try {
      (fn as (...a: T) => unknown)(...args);
    } catch (e) {
      console.warn("composer callback failed after its owner was disposed", e);
    }
  };
}

function HostedComposer(props: { entry: ComposerEntry; dockIndex: () => number }) {
  const Composer = BY_KIND[props.entry.kind];
  const close = () => closeComposer(props.entry.id);

  // Every terminal callback name in use across the composers is forwarded to
  // whatever the opener supplied, and *then* the composer leaves the dock.
  // Order matters: DMComposer fires onSent and then onClose, and openers rely
  // on their own handler running before the entry disappears.
  const after = (name: string) => {
    const supplied = guard(props.entry.props[name]);
    return () => {
      supplied?.();
      close();
    };
  };

  return (
    <ComposerFrameContext.Provider
      value={{
        kind: props.entry.kind,
        mode: props.entry.mode,
        setDocTitle: props.entry.setDocTitle,
        dockIndex: () => props.dockIndex(),
        setMode: (m) => {
          // Zen is a global signal (zen.ts) — a composer coming forward must
          // not inherit the zen state of the one it displaced.
          if (m !== "min") setZenMode(false);
          setComposerMode(props.entry.id, m);
        },
      }}
    >
      <Composer
        {...props.entry.props}
        heading={props.entry.title}
        open={true}
        onPosted={after("onPosted")}
        onSent={after("onSent")}
        onSaved={after("onSaved")}
        onClose={after("onClose")}
        onCancel={after("onCancel")}
        onCreated={after("onCreated")}
        onEdited={after("onEdited")}
      />
    </ComposerFrameContext.Provider>
  );
}

/** One minimized entry: restore on the label, close on the ×. */
function MinimizedItem(props: { entry: ComposerEntry; class: string; onRestore?: () => void }) {
  const { t } = useI18n();
  return (
    <div class={`flex items-center gap-1 ${props.class}`}>
      <button
        type="button"
        class="flex items-center gap-1.5 min-w-0 flex-1 text-xs font-medium text-txt
               hover:text-accent transition-colors"
        title={t("editor.restore")}
        onClick={() => {
          restoreComposer(props.entry.id);
          props.onRestore?.();
        }}
      >
        <ComposerKindIcon kind={props.entry.kind} />
        {/* What is being written, when it has a title — the generic
            heading ("New Post") only until then. */}
        <span class="truncate">{props.entry.docTitle() || props.entry.title || t("post.modal_title")}</span>
      </button>
      <button
        type="button"
        class="p-1 rounded text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
        title={t("editor.close_esc")}
        onClick={() => closeComposer(props.entry.id)}
      >
        <MdOutlineClose class="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * The oldest minimized entries, folded into one "+N" pill. Its own component so
 * createPopover's document listeners only exist while there is an overflow.
 * The panel portals next to the strip — both live in the same top layer.
 */
function OverflowPill(props: { entries: ComposerEntry[]; mount: Element }) {
  const { t } = useI18n();
  const pop = createPopover({ placement: "top-start" });
  return (
    <div ref={pop.ref} class="shrink-0">
      <button
        type="button"
        class="rounded-t-lg border border-rim border-b-0 bg-elevated shadow-lg px-3 py-1.5
               text-xs font-medium text-txt hover:text-accent transition-colors"
        aria-haspopup="true"
        aria-expanded={pop.open()}
        aria-label={t("editor.minimized_more", { count: String(props.entries.length) })}
        onClick={() => pop.setOpen(!pop.open())}
      >
        +{props.entries.length}
      </button>
      <Show when={pop.open()}>
        <Portal mount={props.mount}>
          <div
            ref={pop.floating}
            style={pop.style()}
            class="z-50 w-64 max-w-[calc(100vw-1rem)] max-h-72 overflow-y-auto rounded-lg border
                   border-rim bg-elevated shadow-lg py-1"
          >
            {/* Newest first, like the strip reads from the right. */}
            <For each={[...props.entries].reverse()}>
              {(entry) => (
                <MinimizedItem
                  entry={entry}
                  class="px-3 py-1 hover:bg-surface"
                  onRestore={() => pop.setOpen(false)}
                />
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  );
}

export default function ModalHost(props: {
  /** True while a mobile nav panel ("More" sheet, right sidebar) is open. The
   *  "More" sheet opens at bottom-16 — exactly where the pills sit — so they
   *  step aside for it rather than floating over the nav. */
  navOpen?: boolean;
}) {
  const { t } = useI18n();
  // Same breakpoint ComposerModal uses to decide that "dock" is too narrow to
  // be a panel and should render full-bleed instead.
  const isWide = createMediaQuery("(min-width: 640px)");
  const shownAs = (e: { mode: () => string }) =>
    e.mode() === "dock" && !isWide() ? "page" : e.mode();

  /** Docked entries, newest first — index 0 is the rightmost panel. */
  const dockedRail = () =>
    composerEntries()
      .filter((e) => shownAs(e) === "dock")
      .reverse();
  const expanded = () => composerEntries().find((e) => e.mode() !== "min");
  /** Modal and page take over the screen; only a docked panel leaves it usable. */
  const blocking = () => {
    const e = expanded();
    return !!e && shownAs(e) !== "dock";
  };
  const docked = () => dockedRail().length;

  const minimized = () =>
    props.navOpen || blocking()
      ? []
      : composerEntries().filter((e) => e.mode() === "min");

  // Pills are in creation order and hug the right edge, so the newest sit
  // nearest their composers; the oldest fold into the "+N" pill on the left.
  // Folding a single pill would save nothing, hence the +1.
  // ponytail: fixed count per breakpoint, doesn't measure the free rail width.
  const pillLimit = () => (isWide() ? 3 : 1);
  const overflow = () => {
    const m = minimized();
    return m.length > pillLimit() + 1 ? m.slice(0, m.length - pillLimit()) : [];
  };
  const visiblePills = () => minimized().slice(overflow().length);

  // Where the strip portals to — resolved a microtask after it appears, not
  // during the render that shows it. Minimizing from modal/page happens in that
  // same render, while the entry's <dialog> is still :modal (Modal.tsx only
  // re-opens it non-modal in an effect), so topLayer() would pick that dialog —
  // which then goes `hidden` and takes the pills with it.
  const [stripMount, setStripMount] = createSignal<Element>();
  createEffect(
    on(
      () => minimized().length > 0,
      (show) => {
        setStripMount(undefined);
        if (show) queueMicrotask(() => setStripMount(topLayer()));
      },
    ),
  );

  return (
    <>
      <For each={composerEntries()}>
        {(entry) => (
          <HostedComposer
            entry={entry}
            dockIndex={() => dockedRail().findIndex((e) => e.id === entry.id)}
          />
        )}
      </For>

      {/* ── Dock strip ──
          z-50 like every other composer surface, so the nested pickers at
          z-[60] still win. Pinned bottom-right, on the same right offsets as a
          docked panel (including the xl sidebar dodge) so a pill sits where its
          composer will reappear. `left-0` + justify-end keeps the row
          horizontally scrollable at 360px while still hugging the right edge;
          The pills are rounded-t-lg with no bottom border, so they sit flush on
          the bottom edge; bottom-16 lifts them over the mobile tab bar (h-16,
          hidden from lg up), which is the only reason for any offset.
          A docked panel owns that same corner, so the row is padded out of its
          way and the pills queue up to its left — one bottom-right rail. */}
      <Show when={minimized().length > 0 && stripMount()} keyed>
        {(mount) => (
        <Portal mount={mount}>
          <div
            class="fixed z-50 bottom-16 lg:bottom-0 left-0 right-2 sm:right-4 xl:right-[19.5rem]
                   flex items-end justify-end gap-2 pl-2 overflow-x-auto"
            // 26rem is a docked panel's width, plus the gap — one rail width
            // per panel currently on it.
            style={{
              "padding-right": docked() ? `${docked() * 26.75}rem` : undefined,
            }}
            role="group"
            aria-label={t("editor.minimized_composers")}
          >
            <Show when={overflow().length > 0}>
              <OverflowPill entries={overflow()} mount={mount} />
            </Show>
            <For each={visiblePills()}>
              {(entry) => (
                <MinimizedItem
                  entry={entry}
                  // bg-elevated, not bg-surface: the pill sits over pages and
                  // panels that are themselves bg-surface, and elevated is the
                  // lighter of the two in every theme.
                  class="shrink-0 max-w-[14rem] rounded-t-lg border border-rim border-b-0
                         bg-elevated shadow-lg pl-3 pr-1 py-1.5"
                />
              )}
            </For>
          </div>
        </Portal>
        )}
      </Show>
    </>
  );
}
