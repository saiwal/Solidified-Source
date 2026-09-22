/**
 * ComposerShell.tsx
 * The single source of truth for composer layout rhythm.
 *
 * Before this existed the nine composers carried five different spacing
 * scales (space-y-4 / gap-4 / space-y-3 / gap-3 / space-y-2) and each
 * re-declared its own options and action rows — byte-identical strings in
 * Article, Card, Webpage and Block. This owns that rhythm so a composer only
 * decides *what* goes in each region, never how the regions are spaced.
 *
 * The rhythm is deliberately tight (gap-2.5 between regions, space-y-2 inside
 * them): a docked composer is ~416px wide and the modal is height-capped, so
 * every row of slack costs the editor real space.
 *
 * Deliberately sets no padding, no `max-w-*` and no `mx-auto`: the outer box
 * belongs to the host (the page view's own wrapper plus Layout's page
 * padding, or ComposerModal's dialog). An auto cross-axis margin on a flex
 * item also overrides align-self: stretch, which would make the composer size
 * to fit-content instead of the row — the hazard CardComposer documents at
 * its own render root.
 */

import { Show, onCleanup, createContext, useContext, type Component, type JSX } from "solid-js";
import { zenMode, setZenMode } from "@utsukta/spa-core/store/zen";
import { ComposerFrameContext } from "@/shared/views/modal-host";

/**
 * The editor region's height floor, for the shell and for the two composers
 * that own that box themselves (CardComposer, NoteComposer).
 *
 * A docked panel is only 600px tall, so a 260px floor plus header, meta rows
 * and the action bar guarantees a scrollbar on the panel body — the one thing
 * docking exists to avoid. The editor is `flex-1` in every host, so lowering
 * the floor costs nothing where there IS height: it still fills the modal and
 * the page. Below the floor RichEditor's surface keeps its own 150px min.
 */
export function useEditorFloor(): () => string {
  const frame = useContext(ComposerFrameContext);
  return () => (frame?.mode() === "dock" ? "min-h-[180px]" : "min-h-[260px]");
}

/**
 * Collapses a region whose content is currently all hidden.
 *
 * `<Show when={props.x}>` only tells us the prop was passed — a fragment is
 * truthy even when every <Show> inside it is false. Without this the wrapper
 * still renders, and since the root is a `gap-2.5` flex column an empty div is
 * still a flex item with a gap on either side: a blank band (and, for the
 * options row, a stray border-t rule).
 *
 * `:has(> *)` and not `:empty`, because Solid leaves empty text-node markers
 * where a false <Show> was and those defeat `:empty`; `:has(> *)` tests for
 * element children and ignores them.
 */
const collapseWhenEmpty = "[&:not(:has(>*))]:hidden";

export interface ComposerShellProps {
  /** Meta fields — title, summary, slug, format/language, series, category. */
  meta?: JSX.Element;
  /** RichEditor (+ AttachmentBar), the region that absorbs spare height. */
  editor: JSX.Element;
  /** Full-width extras below the editor: encrypt/decrypt, drafts, location. */
  panels?: JSX.Element;
  /** The single bottom row — ComposerActionBar for every composer: scope on
   *  the left, the primary action and its options menu on the right. The
   *  separate options row it replaced is gone. */
  actions: JSX.Element;
  /**
   * Overrides the editor region's wrapper classes. Pass "contents" when the
   * composer must own that box itself — CardComposer swaps its editor for the
   * assembled templates' sub-forms, and each branch applies the floor itself.
   */
  editorClass?: string;
  /**
   * Outer-box classes from the host. Modal composers pass "p-4" (ComposerModal's
   * body is deliberately unpadded, and padding it there would double up for the
   * callers that pass their own already-padded children). Page-hosted composers
   * pass nothing and inherit Layout's page padding.
   */
  class?: string;
}

/**
 * True inside a ComposerShell — RichEditor uses it to decide whether to float
 * its zen toggle, since zen only means anything for a shell-hosted editor.
 */
export const ZenHostContext = createContext(false);

const ComposerShell: Component<ComposerShellProps> = (props) => {
  const floor = useEditorFloor();
  // Zen outlives its composer otherwise (closed, navigated away from), and the
  // next composer would open straight into it.
  // ponytail: any shell's unmount clears it, not just the one in zen. While zen
  // is on, the other shells are behind an opaque overlay and unreachable — but
  // with ModalHost keeping several composers mounted, closing a *minimized*
  // one's pill now also drops zen in the expanded one. Rare enough to accept;
  // make zen a context keyed on the composer if it starts to bite.
  onCleanup(() => setZenMode(false));

  // Zen hides the four non-editor regions with a class rather than a <Show>:
  // unmounting them would take RichEditor's contenteditable along with it on
  // the way back (Solid re-creates the whole subtree), losing caret and
  // undo history.
  const zenHidden = () => (zenMode() ? "hidden" : "");

  return (
    <ZenHostContext.Provider value={true}>
    {/* Opaque backing for the centred zen column — the column itself is
        width-capped for readability, so it no longer covers the screen. */}
    <Show when={zenMode()}>
      <div class="fixed inset-0 z-[159] bg-surface" />
    </Show>
    <div
      // z-[160] clears every app layer: modal backdrop and mobile tab bar
      // (z-50), right sidebar (z-40), offline banner (z-100), routing bar
      // (z-150) — see Layout.tsx.
      class={
        zenMode()
          ? "fixed inset-0 z-[160] mx-auto max-w-4xl flex flex-col gap-2 bg-surface p-2 sm:p-4"
          : `flex flex-col flex-1 min-h-0 gap-2.5 ${props.class ?? ""}`
      }
    >
      <Show when={props.meta}>
        <div class={`shrink-0 space-y-2 ${collapseWhenEmpty} ${zenHidden()}`}>{props.meta}</div>
      </Show>

      <div
        class={`${
          zenMode()
            ? "flex-1 min-h-0 flex flex-col"
            : (props.editorClass ?? `flex-1 ${floor()} flex flex-col`)
        }`}
      >
        {props.editor}
      </div>

      <Show when={props.panels}>
        <div class={`shrink-0 space-y-2 ${collapseWhenEmpty} ${zenHidden()}`}>{props.panels}</div>
      </Show>

      <div class={`shrink-0 flex flex-wrap items-center gap-2 pb-1 ${zenHidden()}`}>
        {props.actions}
      </div>
    </div>
    </ZenHostContext.Provider>
  );
};

export default ComposerShell;
