import {
  createSignal,
  Show,
  type Component,
  createUniqueId,
} from "solid-js";
import PhotosPicker from "./PhotosPicker";
import FilesPicker from "./FilesPicker";
import type { FileMeta } from "@/modules/files/api";
import type { Photo } from "@/modules/photos/api/api";
import type { AttachmentAccept } from "../AttachmentBar";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineClose } from "solid-icons/md";

import Modal from "@/shared/views/Modal";
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

  const titleId = createUniqueId();
  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-[60]">
      <div class="flex flex-col w-full max-w-2xl h-[85vh] bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
          <span id={titleId} class="text-sm font-semibold text-txt">{t("editor.attach_existing")}</span>
          <button
            type="button"
            onClick={props.onClose}
            class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
          
          aria-label={t("layout.close")}>
            <MdOutlineClose class="w-4 h-4" />
          </button>
        </header>

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
            <button
              type="button"
              onClick={props.onClose}
              class="px-3 py-1.5 text-sm rounded-lg border border-rim text-muted hover:bg-surface transition-colors"
            >
              {t("editor.cancel_btn")}
            </button>
            <button
              type="button"
              disabled={selectionCount() === 0}
              onClick={confirm}
              class="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent text-accent-fg
                     hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {selectionCount() > 0
                ? t("editor.attach_count_btn", { count: selectionCount() })
                : t("editor.attach_btn")}
            </button>
          </div>
        </footer>
      </div>
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
