import {
  createSignal,
  Show,
  For,
  lazy,
  type Component,
} from "solid-js";
import AttachmentPreview from "./AttachmentPreview";
import type { Attachment, AttachmentStore } from "./types";
import type { FileMeta } from "@/modules/files/api";
import type { Photo } from "@/modules/photos/api/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import SourceToggleButton from "../components/SourceToggleButton";
import type { EditorTab } from "../types/editor.types";

// Lazy-load the picker — only fetched when user clicks "Browse existing"
const FilePickerModal = lazy(() => import("./picker/FilePickerModal"));
// Lazy-load the camera capture modal
const CameraCapture = lazy(() => import("./CameraCapture"));

export type AttachmentAccept = "files" | "photos" | "both";

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
}

const AttachmentBar: Component<Props> = (props) => {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [cameraOpen, setCameraOpen] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

  const accept = () => props.accept ?? "both";

  const inputAccept = () => {
    if (accept() === "photos") return "image/*";
    if (accept() === "files") return "*/*";
    return "*/*";
  };

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files).filter((f) => {
      if (accept() === "photos") return f.type.startsWith("image/");
      return true;
    });
    if (arr.length) props.store.addUploads(arr);
  }

  function onInputChange(e: Event) {
    handleFiles((e.currentTarget as HTMLInputElement).files);
    (e.currentTarget as HTMLInputElement).value = "";
  }

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
    handleFiles(e.dataTransfer?.files ?? null);
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
      {/* Action row */}
      <div class="flex items-center gap-2 px-3 py-2">
        {/* Upload from device */}
        <button
          type="button"
          title={t("editor.attach_file_title")}
          onClick={() => fileInputRef?.click()}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted
                 hover:text-txt hover:bg-elevated border border-rim transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          {t("editor.attach_upload")}
        </button>

        {/* Browse existing */}
        <button
          type="button"
          title={t("editor.attach_browse_title")}
          onClick={() => setPickerOpen(true)}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted
                 hover:text-txt hover:bg-elevated border border-rim transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {t("editor.attach_browse")}
        </button>

        {/* Camera capture */}
        <button
          type="button"
          title={t("editor.cam_btn_title")}
          onClick={() => setCameraOpen(true)}
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-muted
                 hover:text-txt hover:bg-elevated border border-rim transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t("editor.cam_title")}
        </button>

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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={inputAccept()}
        class="hidden"
        onChange={onInputChange}
      />

      {/* File picker modal (lazy) */}
      <Show when={pickerOpen()}>
        <FilePickerModal
          nick={props.nick}
          accept={accept()}
          onClose={() => setPickerOpen(false)}
          onSelectFiles={(files: FileMeta[]) => {
            props.store.addCloudFiles(files);
            setPickerOpen(false);
          }}
          onSelectPhotos={(photos: Photo[]) => {
            props.store.addPhotos(photos);
            setPickerOpen(false);
          }}
        />
      </Show>

      {/* Camera capture modal (lazy) */}
      <Show when={cameraOpen()}>
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(files, thumbnail) => {
            if (thumbnail && files.length === 1) {
              props.store.addVideoWithThumbnail(files[0], thumbnail);
            } else {
              props.store.addUploads(files);
            }
          }}
        />
      </Show>
    </div>
  );
};

export default AttachmentBar;
