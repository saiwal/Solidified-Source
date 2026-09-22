// The open/close state machine behind shared/views/Modal.tsx.
//
// A <dialog> can't be converted between modal and non-modal in place: the only
// route is close() then show()/showModal(). That is a problem, because `close`
// is also the event a real dismissal arrives on — and it fires
// ASYNCHRONOUSLY. close() merely queues the event, so a "we're switching"
// flag cleared on the next line is back to false by the time the handler runs,
// and the switch reads as a dismissal. (That is what made the composer flash
// into modal mode and immediately minimize itself.)
//
// So the guard is a *count* that the close handler decrements, never a flag
// cleared by the caller. Lives in its own file so it is testable without a DOM
// — see dialog-mode.test.ts.
export interface DialogLike {
  readonly open: boolean;
  close(): void;
  show(): void;
  showModal(): void;
}

export function createDialogMode(el: () => DialogLike, onDismiss: () => void) {
  let opened: boolean | undefined;
  let expectedCloses = 0;

  const reopen = (wantModal: boolean) => {
    const d = el();
    if (opened === wantModal) return;
    if (d.open) {
      expectedCloses++;
      d.close();
    }
    opened = wantModal;
    if (wantModal) d.showModal();
    else d.show();
  };

  return {
    /** Open, or re-open in the other modality. Idempotent per modality. */
    sync: reopen,
    /** On unmount: this close event can land after we're gone, and is not a
        dismissal either. */
    teardown() {
      const d = el();
      if (d.open) {
        expectedCloses++;
        d.close();
      }
    },
    /** Wire to the dialog's `close` event. Calls onDismiss only for closes we
        did not cause ourselves (Escape, backdrop, a close button). */
    handleClose() {
      if (expectedCloses > 0) {
        expectedCloses--;
        return;
      }
      onDismiss();
    },
  };
}
