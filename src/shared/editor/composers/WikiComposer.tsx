import { createSignal, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import type { MimeType, EditorTab } from "../types/editor.types";
import { underlineFieldClass } from "../lib/fieldStyles";
import FormatSelect from "../components/FormatSelect";
import ComposerShell from "../components/ComposerShell";
import { PrimarySubmitButton, SecondaryButton } from "../components/buttons";
import { canUseWysiwyg } from "@utsukta/spa-core/lib/mimetypes";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { bbcodeToInsert, patchInsertedAlt } from "../attachments/insertHelpers";

// Core's wiki addon offers no HTML option (Mod_Wiki.php:221).
const WIKI_FORMATS = ["text/bbcode", "text/markdown", "text/plain"] as const;

interface Props {
  /** Channel that owns the wiki — uploads land in its cloud files. */
  nick: string;
  /** Stable per-page key so an in-progress upload survives a remount. */
  scope: string;
  initialBody: string;
  initialCommitMsg?: string;
  mimeType: string;
  /** Offer a per-page format picker. Core shows one only on the create-page
   *  form of a wiki whose type is not locked (Widget/Wiki_pages.php:68);
   *  existing pages keep the format they were written in. */
  allowFormatChange?: boolean;
  saving: boolean;
  onSave: (body: string, commitMsg: string, mimeType: string) => void;
  onCancel: () => void;
  onSaveDraft?: (body: string, commitMsg: string) => void;
}

export default function WikiComposer(props: Props) {
  const { t } = useI18n();
  const caps = CAPABILITIES.wiki;

  const [body, setBody] = createSignal(props.initialBody);
  const [tab, setTab] = createSignal<EditorTab>("source");
  const [commitMsg, setCommitMsg] = createSignal(props.initialCommitMsg ?? "");

  // Seeded from the wiki's format; only movable while allowFormatChange is on.
  const [mimeOverride, setMimeOverride] = createSignal<string | null>(null);
  const mime = () => (mimeOverride() ?? props.mimeType ?? "text/bbcode") as MimeType;

  // A wiki page is plain stored text with no item `attach` array, so uploads
  // are only ever referenced from the body — inserted as markup for the page's
  // own format by bbcodeToInsert().
  const attach = createAttachmentStore(props.nick, props.scope);

  return (
    <ComposerShell
      meta={
        <Show when={props.allowFormatChange}>
          <FormatSelect
            value={mime}
            onChange={setMimeOverride}
            body={body}
            choices={WIKI_FORMATS}
          />
        </Show>
      }
      editor={
        <>
          <RichEditor
            onImageAlt={(src, alt) => attach.setAltByUrl(src, alt)}
            body={body()}
            onInput={setBody}
            capabilities={caps}
            tab={tab()}
            onTabChange={setTab}
            mimetype={mime()}
            placeholder={t("editor.start_writing")}
            minHeight="60vh"
          />
          <AttachmentBar
            store={attach}
            nick={props.nick}
            accept="both"
            onInsert={(bbcode) => setBody(body() + "\n" + bbcodeToInsert(bbcode, mime()))}
            onAltChange={(att) => setBody(patchInsertedAlt(body(), att, mime()))}
            tab={tab()}
            onToggleTab={() => setTab(tab() === "wysiwyg" ? "source" : "wysiwyg")}
            canWysiwyg={canUseWysiwyg(mime(), caps.markdownWysiwyg)}
          />
        </>
      }
      panels={
        <input
          type="text"
          class={`w-full px-0 py-1.5 text-sm text-txt ${underlineFieldClass}`}
          placeholder={t("wiki.changes_placeholder")}
          value={commitMsg()}
          onInput={(e) => setCommitMsg(e.currentTarget.value)}
        />
      }
      actions={
        <>
          <div class="flex gap-2 items-center">
            <SecondaryButton onClick={props.onCancel}>{t("wiki.cancel_edit")}</SecondaryButton>
            <Show when={props.onSaveDraft && body().trim()}>
              <SecondaryButton onClick={() => props.onSaveDraft!(body(), commitMsg())}>
                {t("editor.save_draft")}
              </SecondaryButton>
            </Show>
          </div>
          <div class="flex items-center gap-2 ml-auto">
            <PrimarySubmitButton
              onClick={() => props.onSave(body(), commitMsg(), mime())}
              disabled={props.saving || !body().trim()}
            >
              {props.saving ? t("wiki.saving") : t("wiki.save")}
            </PrimarySubmitButton>
          </div>
        </>
      }
    />
  );
}
