import { createSignal, Show, For, type Component } from "solid-js";
import AttachmentPreview from "./AttachmentPreview";
import type { Attachment, AttachmentStore } from "./types";
import { useI18n } from "@utsukta/spa-core/i18n";
import SourceToggleButton from "../components/SourceToggleButton";
import type { EditorTab } from "../types/editor.types";
import { useAttachmentActions, type AttachmentActions, type AttachmentAccept } from "./useAttachmentActions";

export type { AttachmentAccept } from "./useAttachmentActions";

interface Props {
  store: AttachmentStore;
  nick: string;
  accept?: AttachmentAccept;
  /** Called when user clicks "Insert" on an image attachment */
  onInsert?: (bbcode: string) => void;
  /** Called after an attachment's alt text changes (att carries the new value) —
   *  lets the composer patch an already-inserted copy in the body. */
  onAltChange?: (att: Attachment) => void;
  /** Current RichEditor tab — pass together with onToggleTab to render the
   *  wysiwyg/source toggle button at the right of this bar's action row. */
  tab?: EditorTab;
  onToggleTab?: () => void;
  /** Forwarded to SourceToggleButton so it hides for source-only formats. */
  canWysiwyg?: boolean;
  /**
   * Attachment actions owned by the composer, so the editor toolbar can drive
   * the same upload/browse/camera flows. When given, this bar stops rendering
   * those three buttons (the toolbar has them) but still mounts their modals.
   * Omitted — comment/event/wiki surfaces with no toolbar slot for them — the
   * bar owns the actions and keeps the buttons, exactly as before.
   */
  actions?: AttachmentActions;
}

const AttachmentBar: Component<Props> = (props) => {
  const { t } = useI18n();
  const [dragging, setDragging] = createSignal(false);

  const accept = () => props.accept ?? "both";

  // Created unconditionally (it only allocates signals) but used only when the
  // composer did not hand its own down.
  const own = useAttachmentActions(() => props.store, () => props.nick, accept);
  const act = () => props.actions ?? own;

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    act().addFiles(e.dataTransfer?.files ?? null);
  }

  return (
    <div
      class={
        "border-t border-rim transition-colors " +
        (dragging() ? "bg-accent/5 border-accent/40" : "bg-elevated/40")
      }
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Action row — collapses entirely once the toolbar owns the buttons and
          there is nothing else to show, rather than leaving an empty band. */}
      <Show
        when={
          !props.actions ||
          dragging() ||
          props.store.uploading() ||
          (props.tab && props.onToggleTab)
        }
      >
      <div class="flex items-center gap-1.5 sm:gap-2 px-3 py-2">
        {/* Only when the editor toolbar is not already showing them. */}
        <Show when={!props.actions}>
          <>
          {/* Upload from device */}
          <button
            type="button"
            title={t("editor.attach_file_title")}
            onClick={act().openFile}
            class="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-xs text-muted shrink-0
                   hover:text-txt hover:bg-elevated border border-rim transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span class="hidden sm:inline">{t("editor.attach_upload")}</span>
          </button>

          {/* Browse existing */}
          <button
            type="button"
            title={t("editor.attach_browse_title")}
            onClick={act().openBrowse}
            class="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-xs text-muted shrink-0
                   hover:text-txt hover:bg-elevated border border-rim transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="hidden sm:inline">{t("editor.attach_browse")}</span>
          </button>

          {/* Camera capture */}
          <button
            type="button"
            title={t("editor.cam_btn_title")}
            onClick={act().openCamera}
            class="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md text-xs text-muted shrink-0
                   hover:text-txt hover:bg-elevated border border-rim transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span class="hidden sm:inline">{t("editor.cam_title")}</span>
          </button>
          </>
        </Show>

        {/* Drag hint */}
        <Show when={dragging()}>
          <span class="text-xs text-accent ml-1">{t("editor.drop_files")}</span>
        </Show>

        {/* Upload in-progress indicator + wysiwyg/source toggle — bottom-right */}
        <div class="ml-auto flex items-center gap-2">
          <Show when={props.store.uploading()}>
            <span class="text-xs text-muted animate-pulse">{t("editor.uploading")}</span>
          </Show>
          <Show when={props.tab && props.onToggleTab}>
            <SourceToggleButton tab={props.tab!} onToggle={props.onToggleTab!} canWysiwyg={props.canWysiwyg} />
          </Show>
        </div>
      </div>
      </Show>

      {/* Attachment chips */}
      <Show when={props.store.attachments().length > 0}>
        <div class="flex flex-wrap gap-2 px-3 pb-3">
          <For each={props.store.attachments()}>
            {(att) => (
              <AttachmentPreview
                attachment={att}
                onRemove={() => props.store.remove(att.id)}
                onInsert={props.onInsert}
                onAltTextChange={(text) => {
                  props.store.setAltText(att.id, text);
                  props.onAltChange?.({ ...att, altText: text });
                }}
                insertBBCode={props.store.insertBBCode}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Hidden input + picker/camera modals — mounted here even when the
          composer owns the actions, so they live in exactly one place. */}
      {act().surfaces()}

    </div>
  );
};

export default AttachmentBar;
