import { createEffect, onCleanup, type JSX, type ParentComponent } from "solid-js";
import { Portal } from "solid-js/web";
import { createDialogMode } from "@utsukta/spa-core/lib/dialog-mode";

// Native <dialog> + showModal(), which the browser gives focus trapping,
// Escape-to-close, an inert background and a top-layer stacking context for
// free — all of which the ~37 hand-rolled `fixed inset-0` overlays here had
// to do themselves and none of which they actually did.
//
// The dialog element itself is the full-viewport backdrop layer (that is what
// the old wrapper div was), so a click landing on it — i.e. outside the panel
// — is a backdrop click. ::backdrop stays transparent; the dim lives on the
// dialog, matching what the overlays already looked like.
//
//   <Show when={open()}>
//     <Modal onClose={close} label={t("files_mod.rename")}>
//       <form class="w-full max-w-sm rounded-xl …">…</form>
//     </Modal>
//   </Show>
interface Props {
  onClose: () => void;
  /** Accessible name. Prefer `labelledBy` when the panel has a visible title. */
  label?: string;
  /** id of the element naming this dialog. */
  labelledBy?: string;
  /** Extra classes for the backdrop layer — z-index, padding, alignment. */
  class?: string;
  /** Inline styles, for what a class can't express (the composer's dock rail
      offset, which is computed from its index). */
  style?: JSX.CSSProperties;
  /** Default true. false for modals where a stray click would lose input. */
  dismissOnBackdrop?: boolean;
  /** The caller owns the whole layout: position, size, dim, padding. Nothing
      is set here beyond the <dialog> resets, so there is no competing utility
      to lose a source-order fight with. For full-screen overlays and for the
      composer, whose docked mode is a corner panel rather than an overlay. */
  bare?: boolean;
  /** false renders a non-modal dialog (`show()`): no focus trap, no inert
      background, page stays interactive. For the composer's docked mode,
      where claiming modality would be a lie. Switching this re-opens the
      dialog in the new mode without unmounting it. */
  modal?: boolean;
}

const Modal: ParentComponent<Props> = (props) => {
  let el!: HTMLDialogElement;
  // close() restores focus to the opener, but the usual close path is the
  // parent <Show> flipping false and unmounting us, which never runs it. Grab
  // the opener up front and restore only if nothing else claimed focus.
  const opener = document.activeElement as HTMLElement | null;

  // Opening, and switching between modal and non-modal, is a small state
  // machine with an async-event trap in it — see dialog-mode.ts and its test.
  const dialog = createDialogMode(() => el, () => props.onClose());
  createEffect(() => dialog.sync(props.modal !== false));
  onCleanup(() => {
    dialog.teardown();
    const active = document.activeElement;
    if (!active || active === document.body) opener?.focus({ preventScroll: true });
  });

  // Portaled to <body>, never rendered where the caller happens to sit: a
  // transform anywhere up the tree (the right sidebar's off-canvas
  // `translate-x-0`, Layout.tsx) becomes the containing block for every
  // `position: fixed` descendant of the dialog, so a portaled dropdown
  // computed in viewport coords landed inside the sidebar. The dialog is in
  // the top layer either way; only its descendants' coordinate space was at
  // stake.
  return (
    <Portal mount={document.body}>
    <dialog
      ref={el}
      style={props.style}
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      // The DOM `close` event — fires for Escape (via `cancel`) and for any
      // el.close() — so it is the single exit for every dismissal path.
      onClose={() => dialog.handleClose()}
      onClick={(e) => {
        if (e.target === el && props.dismissOnBackdrop !== false) props.onClose();
      }}
      // index.css resets <dialog>'s UA geometry defaults in @layer base, so
      // these utilities are the whole story for where the box lands.
      class={`${
        props.bare
          ? ""
          : "fixed inset-0 w-full h-full p-4 bg-black/40 backdrop-blur-sm " +
            "flex items-center justify-center"
      } ${props.class ?? ""}`}
    >
      {props.children}
    </dialog>
    </Portal>
  );
};

export default Modal;
