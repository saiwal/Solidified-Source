import type { ComponentProps } from "solid-js";
import ComposerModal from "../components/ComposerModal";
import ArticleComposer from "./ArticleComposer";

// Modal wrapper around ArticleComposer (mirrors ArticleModal in ArticlesView).

export default function ArticleComposerModal(props: {
  uid: number;
  nick: string;
  heading: string;
  initial?: ComponentProps<typeof ArticleComposer>["initial"];
  translationOf?: { uuid: string; excludeLangs: string[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <ComposerModal title={props.heading} onClose={props.onClose} widthClass="max-w-3xl">
      <ArticleComposer
        profileUid={props.uid}
        nick={props.nick}
        initial={props.initial}
        translationOf={props.translationOf}
        onSaved={props.onSaved}
        onCancel={props.onClose}
      />
    </ComposerModal>
  );
}
