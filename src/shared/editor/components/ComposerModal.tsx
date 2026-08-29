import { onMount, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";
import { helpable } from "@utsukta/spa-core/lib/helpable";
import { IconButton } from "./buttons";
void helpable;

// Shared modal shell for the compose surfaces (post, DM, article, note) —
// replaces ~5 near-duplicate Portal/backdrop/dialog implementations. Opens
// at a fixed, generous height (not shrink-to-content) so RichEditor's `fill`
// mode always has real space to grow into; only the body region scrolls,
// and only as a fallback once its flex children can't fit.

export interface ComposerModalProps {
  title: string;
  onClose: () => void;
  ariaLabel?: string;
  /** Default "max-w-2xl" (post/DM); pass "max-w-3xl" for article/note. */
  widthClass?: string;
  /** Post's expand-to-fullscreen toggle — swaps the fixed-height dialog for
   *  a borderless full-viewport overlay. */
  fullscreen?: boolean;
  /** Extra header controls rendered before the close button (e.g. Post's
   *  fullscreen toggle). */
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

  if (props.manageEscape !== false) {
    onMount(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") props.onClose();
      };
      document.addEventListener("keydown", onKey);
      onCleanup(() => document.removeEventListener("keydown", onKey));
    });
  }

  return (
    <Portal mount={document.body}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
        use:helpable={props.helpTarget}
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div
          class={
            "flex flex-col bg-surface border border-rim shadow-2xl text-txt " +
            (props.fullscreen
              ? "fixed inset-0 w-full rounded-none"
              : `w-full ${props.widthClass ?? "max-w-2xl"} h-[85dvh] rounded-xl`)
          }
          role="dialog"
          aria-modal="true"
          aria-label={props.ariaLabel ?? props.title}
        >
          {/* ── Header ── */}
          <header
            class={
              "flex items-center justify-between px-4 py-3 border-b border-rim shrink-0 " +
              (props.fullscreen ? "" : "rounded-t-xl")
            }
          >
            <h2 class="text-sm font-semibold text-txt">{props.title}</h2>
            <div class="flex items-center gap-1">
              {props.headerExtra}
              <IconButton title={t("editor.close_esc")} dataTour="composer.close" onClick={props.onClose}>
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
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
              class={
                "flex flex-col gap-2 px-3.5 py-2.5 border-t border-rim bg-surface shrink-0 " +
                (props.fullscreen ? "" : "rounded-b-xl")
              }
            >
              {props.footer}
            </footer>
          </Show>
        </div>
      </div>
    </Portal>
  );
}
