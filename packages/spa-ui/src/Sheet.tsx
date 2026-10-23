// solidified's implementation of the sheet contract
// (spa-core types/ui.types.ts): a Modal with the panel attached to an edge.
// Reusing Modal keeps the native <dialog> focus trap, Escape, inert page and
// focus restore, which a hand-rolled fixed overlay doesn't get.
import type { SheetProps } from "@utsukta/spa-core/types/ui.types";
import { Modal } from "@ui/Modal";

const DIALOG = {
  right: "fixed inset-0 w-full h-full z-50 bg-black/50 flex items-stretch justify-end",
  left: "fixed inset-0 w-full h-full z-50 bg-black/50 flex items-stretch justify-start",
  bottom: "fixed inset-0 w-full h-full z-50 bg-black/50 flex items-end justify-center",
} as const;

const PANEL = {
  right: "h-full max-h-none w-full max-w-md rounded-none rounded-l-2xl overflow-y-auto",
  left: "h-full max-h-none w-full max-w-md rounded-none rounded-r-2xl overflow-y-auto",
  bottom: "w-full max-w-none rounded-b-none rounded-t-2xl max-h-[85vh] overflow-y-auto",
} as const;

export function Sheet(props: SheetProps) {
  const side = () => props.side ?? "right";
  return (
    <Modal onClose={props.onClose} label={props.label} bare class={DIALOG[side()]}>
      <div class={`hz-sheet bg-surface border border-rim shadow-2xl ${PANEL[side()]} ${props.class ?? ""}`}>
        {props.children}
      </div>
    </Modal>
  );
}
