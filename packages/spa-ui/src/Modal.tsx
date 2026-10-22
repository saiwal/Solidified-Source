import {
  Show, createContext, createEffect, createSignal, createUniqueId, onCleanup, splitProps, useContext,
} from "solid-js";
import { Portal } from "solid-js/web";
import { createDialogMode } from "@utsukta/spa-core/lib/dialog-mode";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { ModalPanelProps, ModalProps, ModalSize } from "@utsukta/spa-core/types/ui.types";
import { IconButton } from "@ui/Button";
import { cardHeaderClass } from "@ui/Card";
import { MdOutlineClose } from "solid-icons/md";

// solidified's implementation of the modal contract (spa-core types/ui.types.ts).
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

// A ModalPanel with a `title` registers its heading here, so the dialog is
// named without the call site wiring labelledBy.
const ModalContext = createContext<{ title: (id: string) => void; description: (id: string) => void }>();

export function Modal(props: ModalProps) {
  const [titleId, setTitleId] = createSignal<string>();
  const [descId, setDescId] = createSignal<string>();
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
      aria-labelledby={props.labelledBy ?? titleId()}
      aria-describedby={descId()}
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
      <ModalContext.Provider value={{ title: setTitleId, description: setDescId }}>{props.children}</ModalContext.Provider>
    </dialog>
    </Portal>
  );
}

const MAX_W: Record<ModalSize, string> = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" };

/** The dialog box: a raised card. Padding stays at the call site, as with Card. */
export function modalPanelClass(size?: ModalSize): string {
  return `hz-modal-panel w-full ${size ? MAX_W[size] : ""} bg-surface border border-rim rounded-xl shadow-2xl`;
}

export function ModalPanel(props: ModalPanelProps) {
  const [own, rest] = splitProps(props, ["size", "title", "description", "onClose", "footer", "class", "children"]);
  const { t } = useI18n();
  const id = createUniqueId();
  const register = useContext(ModalContext);
  if (own.title !== undefined) register?.title(id);
  if (own.description !== undefined) register?.description(`${id}-desc`);
  return (
    <div class={`${modalPanelClass(own.size)} ${own.class ?? ""}`} {...rest}>
      <Show when={own.title !== undefined}>
        <div class={`${cardHeaderClass} flex items-center gap-3`}>
          <div class="flex-1 min-w-0">
            <h2 id={id} class="truncate text-sm font-semibold text-txt">{own.title}</h2>
            <Show when={own.description !== undefined}>
              <p id={`${id}-desc`} class="text-xs text-muted">{own.description}</p>
            </Show>
          </div>
          <Show when={own.onClose}>
            <IconButton label={t("layout.close")} size="sm" onClick={() => own.onClose?.()}>
              <MdOutlineClose size={16} />
            </IconButton>
          </Show>
        </div>
      </Show>
      {own.children}
      <Show when={own.footer}>
        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-rim">{own.footer}</div>
      </Show>
    </div>
  );
}
