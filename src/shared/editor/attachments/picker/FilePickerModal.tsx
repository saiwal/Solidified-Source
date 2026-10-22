import {
  createSignal,
  Show,
  type Component,
} from "solid-js";
import PhotosPicker from "./PhotosPicker";
import FilesPicker from "./FilesPicker";
import type { FileMeta } from "@/modules/files/api";
import type { Photo } from "@/modules/photos/api/api";
import type { AttachmentAccept } from "../AttachmentBar";
import { useI18n } from "@utsukta/spa-core/i18n";

import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
type Tab = "photos" | "files";

interface Props {
  nick: string;
  accept: AttachmentAccept;
  onClose: () => void;
  onSelectFiles: (files: FileMeta[]) => void;
  onSelectPhotos: (photos: Photo[]) => void;
}

const FilePickerModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const defaultTab = (): Tab =>
    props.accept === "files" ? "files" : "photos";

  const [tab, setTab] = createSignal<Tab>(defaultTab());
  const [selectedPhotoIds, setSelectedPhotoIds] = createSignal<Set<string>>(new Set());
  const [selectedFileHashes, setSelectedFileHashes] = createSignal<Set<string>>(new Set());
  const [photoMap, setPhotoMap] = createSignal<Map<string, Photo>>(new Map());
  const [fileMap, setFileMap] = createSignal<Map<string, FileMeta>>(new Map());

  function togglePhoto(photo: Photo) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.has(photo.resource_id) ? next.delete(photo.resource_id) : next.add(photo.resource_id);
      return next;
    });
    setPhotoMap((prev) => {
      const next = new Map(prev);
      if (next.has(photo.resource_id)) next.delete(photo.resource_id);
      else next.set(photo.resource_id, photo);
      return next;
    });
  }

  function toggleFile(file: FileMeta) {
    setSelectedFileHashes((prev) => {
      const next = new Set(prev);
      next.has(file.hash) ? next.delete(file.hash) : next.add(file.hash);
      return next;
    });
    setFileMap((prev) => {
      const next = new Map(prev);
      if (next.has(file.hash)) next.delete(file.hash);
      else next.set(file.hash, file);
      return next;
    });
  }

  function confirm() {
    if (tab() === "photos" && selectedPhotoIds().size > 0) {
      props.onSelectPhotos(Array.from(photoMap().values()));
    } else if (tab() === "files" && selectedFileHashes().size > 0) {
      props.onSelectFiles(Array.from(fileMap().values()));
    } else {
      props.onClose();
    }
  }

  const selectionCount = () =>
    tab() === "photos"
      ? selectedPhotoIds().size
      : selectedFileHashes().size;

  return (
    <Modal onClose={props.onClose} class="z-[60]">
      <ModalPanel
        title={t("editor.attach_existing")}
        onClose={props.onClose}
        size="xl"
        class="flex flex-col h-[85vh] overflow-hidden"
      >
        {/* Header */}

        {/* Tabs */}
        <div class="flex border-b border-rim shrink-0">
          <Show when={props.accept !== "files"}>
            <TabButton
              label={t("editor.photos_tab")}
              active={tab() === "photos"}
              onClick={() => setTab("photos")}
            />
          </Show>
          <Show when={props.accept !== "photos"}>
            <TabButton
              label={t("editor.files_tab")}
              active={tab() === "files"}
              onClick={() => setTab("files")}
            />
          </Show>
        </div>

        {/* Content */}
        <div class="flex-1 overflow-hidden min-h-0 p-4">
          <Show when={tab() === "photos"}>
            <PhotosPicker
              nick={props.nick}
              selected={selectedPhotoIds}
              onToggle={togglePhoto}
            />
          </Show>
          <Show when={tab() === "files"}>
            <FilesPicker
              nick={props.nick}
              accept={props.accept}
              selected={selectedFileHashes}
              onToggle={toggleFile}
            />
          </Show>
        </div>

        {/* Footer */}
        <footer class="flex items-center justify-between px-4 py-3 border-t border-rim bg-elevated shrink-0">
          <span class="text-xs text-muted">
            <Show when={selectionCount() > 0} fallback={t("editor.select_to_attach")}>
              {t("editor.selected_count", { count: selectionCount() })}
            </Show>
          </span>
          <div class="flex gap-2">
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              {t("editor.cancel_btn")}
            </Button>
            <Button size="sm" disabled={selectionCount() === 0} onClick={confirm}>
              {selectionCount() > 0
                ? t("editor.attach_count_btn", { count: selectionCount() })
                : t("editor.attach_btn")}
            </Button>
          </div>
        </footer>
      </ModalPanel>
    </Modal>
  );
};

export default FilePickerModal;

// ── Helper ────────────────────────────────────────────────────────────────────

function TabButton(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={
        "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors " +
        (props.active
          ? "border-accent text-txt"
          : "border-transparent text-muted hover:text-txt hover:border-rim")
      }
    >
      {props.label}
    </button>
  );
}
