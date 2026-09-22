import {
  onMount,
  onCleanup,
  createEffect,
  createSignal,
  on,
  useContext,
  Show,
  type JSX,
} from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { useI18n } from "@utsukta/spa-core/i18n";
import { helpable } from "@utsukta/spa-core/lib/helpable";
import { IconButton } from "./buttons";
import {
  ComposerFrameContext,
  type ComposerKind,
  type ComposerMode,
} from "@/shared/views/modal-host";
import { draftSavedAt } from "../store/createComposerStore";
import { MdOutlineArticle, MdOutlineClose, MdOutlineDescription, MdOutlineEdit, MdOutlineMail_outline, MdOutlineRemove } from "solid-icons/md";
void helpable;

import Modal from "@/shared/views/Modal";
// Shared modal shell for the compose surfaces (post, DM, article, note) —
// replaces ~5 near-duplicate Portal/backdrop/dialog implementations. Opens
// at a fixed, generous height (not shrink-to-content) so RichEditor's `fill`
// mode always has real space to grow into; only the body region scrolls,
// and only as a fallback once its flex children can't fit.
//
// When mounted by ModalHost it also gets the dock/page/minimize modes.
// Those only ever swap CLASSES on the elements below — never the tree shape —
// because remounting takes RichEditor's contenteditable, caret and undo
// history with it (same reason ComposerShell hides its zen regions with a
// class instead of a <Show>).

/** One glyph per kind, so the header says what is being written at a glance. */
const KIND_ICON: Record<ComposerKind, () => JSX.Element> = {
  post: () => (
    <MdOutlineEdit class="w-4 h-4" />
  ),
  dm: () => (
    <MdOutlineMail_outline class="w-4 h-4" />
  ),
  article: () => (
    <MdOutlineArticle class="w-4 h-4" />
  ),
  card: () => (
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  note: () => (
    <MdOutlineDescription class="w-4 h-4" />
  ),
};

/** Shared by this header, the dock's minimized pills and the scheduled queue. */
export function ComposerKindIcon(props: { kind: ComposerKind }) {
  return <span class="shrink-0 text-muted">{KIND_ICON[props.kind]()}</span>;
}

export interface ComposerModalProps {
  title: string;
  onClose: () => void;
  ariaLabel?: string;
  /** Default "max-w-2xl" (post/DM); pass "max-w-3xl" for article/note. */
  widthClass?: string;
  /** Extra header controls rendered before the close button. */
  headerExtra?: JSX.Element;
  /** use:helpable target for the backdrop (help-mode tutorial picker). */
  helpTarget?: string;
  /**
   * False when the caller already manages its own Escape-key handling (e.g.
   * to let a mention/emoji popup intercept Escape before the modal closes).
   * Default true binds a plain Escape-to-close listener here.
   */
  manageEscape?: boolean;
  /** Optional pinned footer (action buttons). Composers whose action row
   *  lives inside their own scrollable content can omit this. */
  footer?: JSX.Element;
  children: JSX.Element;
}

export default function ComposerModal(props: ComposerModalProps) {
  const { t } = useI18n();
  const frame = useContext(ComposerFrameContext);
  // A 26rem panel is useless at 360px, so a docked composer renders full-bleed
  // on a phone. Its stored mode stays "dock" — only the presentation changes.
  const isWide = createMediaQuery("(min-width: 640px)");

  const mode = (): ComposerMode => {
    const m = frame?.mode() ?? "modal";
    return m === "dock" && !isWide() ? "page" : m;
  };

  /** Escape and backdrop-click are recoverable when hosted (the composer keeps
   *  its state in the dock) and destructive when not, so they differ. */
  const dismiss = () => (frame ? frame.setMode("min") : props.onClose());

  // Autosave is silent by design, so the header says so briefly — otherwise a
  // writer has no signal that their draft is safe.
  const [savedFlash, setSavedFlash] = createSignal(false);
  createEffect(
    on(
      draftSavedAt,
      (at) => {
        if (!at) return;
        setSavedFlash(true);
        const id = setTimeout(() => setSavedFlash(false), 2500);
        onCleanup(() => clearTimeout(id));
      },
      { defer: true },
    ),
  );

  if (props.manageEscape !== false) {
    onMount(() => {
      const onKey = (e: KeyboardEvent) => {
        // A minimized composer is still mounted, so every pill in the dock
        // would otherwise answer one Escape press.
        // Modal and page modes are a real <dialog showModal()>, where the
        // browser already closes on Escape — this listener is what covers the
        // docked mode, which is deliberately non-modal.
        if (e.key === "Escape" && mode() !== "min" && !isModalLike()) dismiss();
      };
      document.addEventListener("keydown", onKey);
      onCleanup(() => document.removeEventListener("keydown", onKey));
    });
  }

  // Every mode stays at z-50, exactly where the modal has always been. Going
  // higher would bury the ~17 nested pickers a composer opens (FilePickerModal,
  // FilePreviewModal, RecipientField… all z-[60], Excalidraw's dialog z-90).
  // Layout.tsx has the rest of the stack.
  const wrapperClass = () => {
    switch (mode()) {
      case "min":
        // Hidden, NOT unmounted — the whole point of minimizing.
        return "hidden";
      case "dock":
        // No backdrop: pointer-events-none keeps the page behind clickable and
        // incidentally makes the backdrop-click handler below unreachable.
        // bottom-16 clears the mobile tab bar, which is h-16 and only hidden
        // from lg up; xl:right-[19.5rem] dodges the right sidebar, copied from
        // the scroll-to-top button (Layout.tsx:401).
        // ponytail: on desktop the panel covers the scroll-to-top button (same
        // z, later in <body>, so dock wins) — Gmail does the same.
        return (
          "fixed z-50 right-2 sm:right-4 xl:right-[19.5rem] bottom-16 lg:bottom-0 " +
          "flex items-end justify-end pointer-events-none"
        );
      case "page":
        return "fixed inset-0 z-50 flex items-stretch justify-center bg-base";
      default:
        return "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60";
    }
  };

  const dialogClass = () => {
    // Only the shape is shared: the card treatment (surface, border, shadow,
    // rounding) belongs to the two modes that are *boxes*. Page mode is a page —
    // carrying a border and a floating card over a backdrop is exactly what it
    // exists to get away from.
    const base = "flex flex-col overflow-hidden text-txt pointer-events-auto ";
    const card = "bg-surface border border-rim shadow-2xl ";
    switch (mode()) {
      case "dock":
        return (
          base +
          card +
          // Flush with the bottom edge like the pills, so only the top corners
          // are rounded and the bottom border would just be a rule on the edge.
          "rounded-t-xl border-b-0 " +
          // 600px, not 512: the panel has to hold header + meta + action bar
          // over the editor's docked floor (useEditorFloor in ComposerShell)
          // without the body scrolling.
          "w-[min(26rem,calc(100vw_-_1rem))] h-[min(37.5rem,calc(100dvh_-_8rem))]"
        );
      case "page":
        // Same bg as the wrapper, so the column has no visible edge at all —
        // max-w-4xl still keeps the measure readable on a wide monitor.
        return base + "bg-base w-full max-w-4xl h-full";
      default:
        return base + card + `rounded-xl w-full ${props.widthClass ?? "max-w-2xl"} h-[85dvh]`;
    }
  };

  const isModalLike = () => mode() === "modal" || mode() === "page";

  /**
   * Docked panels queue leftwards along the bottom-right rail. margin-right
   * stacks on top of the `right-*` classes rather than replacing them, so the
   * breakpoint offsets (and the xl sidebar dodge) still apply to slot 0.
   */
  const railOffset = () =>
    mode() === "dock" && frame ? `${frame.dockIndex() * 26.75}rem` : undefined;

  return (
    <Modal
      onClose={dismiss}
      // Docked, the rest of the page stays interactive — showModal() would
      // make the page inert, which is exactly what dock mode exists to avoid.
      modal={isModalLike()}
      bare
      class={wrapperClass()}
      style={{ "margin-right": railOffset() }}
      label={props.ariaLabel ?? props.title}
    >
        <div class={dialogClass()} use:helpable={props.helpTarget}>
          {/* ── Header ── */}
          <header
            class="flex items-center justify-between gap-2 px-3 py-2 border-b border-rim shrink-0"
          >
            <div class="flex items-center gap-2 min-w-0">
              <Show when={frame}>
                {(f) => <ComposerKindIcon kind={f().kind} />}
              </Show>
              <h2 class="text-sm font-semibold text-txt truncate">{props.title}</h2>
              <Show when={savedFlash()}>
                <span class="shrink-0 text-xs text-muted animate-pulse">
                  {t("editor.draft_saved")}
                </span>
              </Show>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              {props.headerExtra}
              <Show when={frame}>
                {(f) => (
                  <>
                    <IconButton
                      title={t("editor.minimize")}
                      onClick={() => f().setMode("min")}
                    >
                      <MdOutlineRemove class="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      title={f().mode() === "dock" ? t("editor.modal_mode") : t("editor.dock_mode")}
                      onClick={() => f().setMode(f().mode() === "dock" ? "modal" : "dock")}
                    >
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <rect x="12" y="13" width="7" height="6" rx="1" />
                      </svg>
                    </IconButton>
                    <IconButton
                      title={f().mode() === "page" ? t("editor.modal_mode") : t("editor.page_mode")}
                      onClick={() => f().setMode(f().mode() === "page" ? "modal" : "page")}
                    >
                      <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <Show
                          when={f().mode() === "page"}
                          fallback={<path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5" />}
                        >
                          <path d="M9 4H4v5M15 20h5v-5M15 4h5v5M9 20H4v-5" />
                        </Show>
                      </svg>
                    </IconButton>
                  </>
                )}
              </Show>
              <IconButton title={t("editor.close_esc")} dataTour="composer.close" onClick={props.onClose}>
                <MdOutlineClose class="w-4 h-4" />
              </IconButton>
            </div>
          </header>

          {/* ── Body — the only scroll region, and only as a fallback once
               its flex children (meta fields shrink-0, editor flex-1) can't
               fit; the editor's own internal scroll handles long text first. ── */}
          <div class="flex-1 overflow-y-auto min-h-0 flex flex-col">{props.children}</div>

          {/* ── Optional pinned footer ── */}
          <Show when={props.footer}>
            <footer
              class="flex flex-col gap-2 px-3 py-2 border-t border-rim bg-surface shrink-0"
            >
              {props.footer}
            </footer>
          </Show>
        </div>
    </Modal>
  );
}
