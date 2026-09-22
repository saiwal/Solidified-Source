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
import { For, Show, lazy, type Component } from "solid-js";
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


const PostComposer = lazy(() => import("@/shared/editor/composers/PostComposer"));
const DMComposer = lazy(() => import("@/shared/editor/composers/DMComposer"));
const ArticleComposerModal = lazy(() => import("@/shared/editor/composers/ArticleComposerModal"));
const CardComposerModal = lazy(() => import("@/shared/editor/composers/CardComposerModal"));
const NoteComposerModal = lazy(() => import("@/shared/editor/composers/NoteComposerModal"));
const PostDetailModal = lazy(() => import("./PostDetailModal"));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BY_KIND: Record<ComposerKind, Component<any>> = {
  post: PostComposer,
  dm: DMComposer,
  article: ArticleComposerModal,
  card: CardComposerModal,
  note: NoteComposerModal,
  thread: PostDetailModal,
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
      />
    </ComposerFrameContext.Provider>
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
      <Show when={minimized().length > 0}>
        <Portal mount={topLayer()}>
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
            <For each={minimized()}>
              {(entry) => (
                <div
                  // bg-elevated, not bg-surface: the pill sits over pages and
                  // panels that are themselves bg-surface, and elevated is the
                  // lighter of the two in every theme.
                  class="flex items-center gap-1 shrink-0 max-w-[14rem] rounded-t-lg border border-rim
                         border-b-0 bg-elevated shadow-lg pl-3 pr-1 py-1.5"
                >
                  <button
                    type="button"
                    class="flex items-center gap-1.5 min-w-0 text-xs font-medium text-txt
                           hover:text-accent transition-colors"
                    title={t("editor.restore")}
                    onClick={() => restoreComposer(entry.id)}
                  >
                    <ComposerKindIcon kind={entry.kind} />
                    {/* What is being written, when it has a title — the generic
                        heading ("New Post") only until then. */}
                    <span class="truncate">{entry.docTitle() || entry.title || t("post.modal_title")}</span>
                  </button>
                  <button
                    type="button"
                    class="p-1 rounded text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title={t("editor.close_esc")}
                    onClick={() => closeComposer(entry.id)}
                  >
                    <MdOutlineClose class="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </>
  );
}
