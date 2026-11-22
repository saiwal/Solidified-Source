import ComposerModal from "../components/ComposerModal";
import NoteComposer from "./NoteComposer";

// Modal wrapper around NoteComposer (mirrors ArticleComposerModal) — used by
// the HQ DraftsWidget to load a saved note draft without leaving the page.

export default function NoteComposerModal(props: {
  nick: string;
  heading: string;
  initial?: {
    mid: string;
    body: string;
    mimetype: string;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <ComposerModal title={props.heading} onClose={props.onClose} helpTarget="notepad.writing_a_note">
      <NoteComposer
        nick={props.nick}
        initial={props.initial}
        onSaved={props.onSaved}
        onCancel={props.onClose}
        fill
      />
    </ComposerModal>
  );
}
