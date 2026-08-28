import type { ComponentProps } from "solid-js";
import ComposerModal from "../components/ComposerModal";
import CardComposer from "./CardComposer";

// Modal wrapper around CardComposer (mirrors CardModal in CardsHeaderWidget).

export default function CardComposerModal(props: {
  uid: number;
  nick: string;
  heading: string;
  initial?: ComponentProps<typeof CardComposer>["initial"];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <ComposerModal title={props.heading} onClose={props.onClose} widthClass="max-w-3xl">
      <CardComposer
        profileUid={props.uid}
        nick={props.nick}
        initial={props.initial}
        onSaved={props.onSaved}
        onCancel={props.onClose}
      />
    </ComposerModal>
  );
}
