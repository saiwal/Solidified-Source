/**
 * useAttachmentActions.tsx
 *
 * The three ways to add an attachment — upload from device, browse the hub's
 * files/photos, capture from the camera — as openers plus the surfaces they
 * need (hidden file input, picker modal, camera modal).
 *
 * Split out of AttachmentBar because the buttons moved into the editor toolbar
 * while the modals, the drop zone and the attachment chips stayed in the bar:
 * two components now trigger the same three actions, so the state behind them
 * can no longer live inside either one.
 */
import { createSignal, Show, lazy, type JSX } from "solid-js";
import type { AttachmentStore } from "./types";
import type { FileMeta } from "@/modules/files/api";
import type { Photo } from "@/modules/photos/api/api";

// Lazy — only fetched when the user actually opens one.
const FilePickerModal = lazy(() => import("./picker/FilePickerModal"));
const CameraCapture = lazy(() => import("./CameraCapture"));

export type AttachmentAccept = "files" | "photos" | "both";

export interface AttachmentActions {
  openFile: () => void;
  openBrowse: () => void;
  openCamera: () => void;
  /** Adds a FileList/array, filtered by `accept`. Shared by the input and drops. */
  addFiles: (files: FileList | File[] | null) => void;
  /** Mount once — the hidden input and the two lazy modals. */
  surfaces: () => JSX.Element;
}

export function useAttachmentActions(
  store: () => AttachmentStore,
  nick: () => string,
  accept: () => AttachmentAccept,
): AttachmentActions {
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const [cameraOpen, setCameraOpen] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) =>
      accept() === "photos" ? f.type.startsWith("image/") : true,
    );
    if (arr.length) store().addUploads(arr);
  };

  const surfaces = () => (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={accept() === "photos" ? "image/*" : "*/*"}
        class="hidden"
        onChange={(e) => {
          addFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />

      <Show when={pickerOpen()}>
        <FilePickerModal
          nick={nick()}
          accept={accept()}
          onClose={() => setPickerOpen(false)}
          onSelectFiles={(files: FileMeta[]) => {
            store().addCloudFiles(files);
            setPickerOpen(false);
          }}
          onSelectPhotos={(photos: Photo[]) => {
            store().addPhotos(photos);
            setPickerOpen(false);
          }}
        />
      </Show>

      <Show when={cameraOpen()}>
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(files, thumbnail) => {
            if (thumbnail && files.length === 1) {
              store().addVideoWithThumbnail(files[0], thumbnail);
            } else {
              store().addUploads(files);
            }
          }}
        />
      </Show>
    </>
  );

  return {
    openFile: () => fileInputRef?.click(),
    openBrowse: () => setPickerOpen(true),
    openCamera: () => setCameraOpen(true),
    addFiles,
    surfaces,
  };
}
