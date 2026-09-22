/**
 * SaveToCloudDialog.tsx
 * Filename + destination folder + permissions for saving a drawing into the
 * channel's cloud storage. Reuses the editor's folder browser (FilesPicker)
 * and ACL picker rather than growing new ones.
 */
import { createSignal, Show, type Component, createUniqueId } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import FilesPicker, { type PickerFolder } from "@/shared/editor/attachments/picker/FilesPicker";
import AclPicker, { entryKey, type AclEntry, type AclMode } from "@/shared/editor/components/AclPicker";
import { aclFromPickerKeys } from "@/modules/files/api";
import { saveSceneToCloud, defaultSceneName } from "./scene-io";
import type { ExcalidrawExport } from "./ExcalidrawCanvas";
import { MdOutlineClose } from "solid-icons/md";

import Modal from "@/shared/views/Modal";
interface Props {
  nick: string;
  api: ExcalidrawExport;
  onClose: () => void;
  /** Called with a warning string when the save succeeded but the ACL didn't. */
  onSaved: (warning: string | null) => void;
}

const SaveToCloudDialog: Component<Props> = (props) => {
  const { t } = useI18n();
  const [filename, setFilename] = createSignal(defaultSceneName());
  const [folder, setFolder] = createSignal<PickerFolder>({ hash: "", displayPath: "" });
  const [mode, setMode] = createSignal<AclMode>("public");
  const [allowKeys, setAllowKeys] = createSignal<Set<string>>(new Set());
  const [denyKeys, setDenyKeys] = createSignal<Set<string>>(new Set());
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  function toggleEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    const [setSame, setOther] =
      list === "allow" ? [setAllowKeys, setDenyKeys] : [setDenyKeys, setAllowKeys];
    setSame((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setOther((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function save() {
    const name = filename().trim();
    if (!name || busy()) return;
    setBusy(true);
    setError("");
    try {
      const warning = await saveSceneToCloud(
        props.nick,
        props.api,
        name,
        folder(),
        aclFromPickerKeys(mode(), allowKeys(), denyKeys()),
      );
      props.onSaved(warning);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const titleId = createUniqueId();
  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-[90]">
      <div class="flex flex-col w-full max-w-2xl h-[85vh] bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden">
        <header class="flex items-center justify-between px-4 py-3 border-b border-rim shrink-0">
          <span id={titleId} class="text-sm font-semibold text-txt">{t("editor.excalidraw_save_title")}</span>
          <button
            type="button"
            onClick={props.onClose}
            class="p-1.5 rounded-md text-muted hover:text-txt hover:bg-elevated transition-colors"
          
          aria-label={t("layout.close")}>
            <MdOutlineClose class="w-4 h-4" />
          </button>
        </header>

        <div class="flex-1 min-h-0 flex flex-col gap-4 p-4">
          <label class="block shrink-0">
            <span class="block text-xs text-muted mb-1">{t("editor.excalidraw_filename_prompt")}</span>
            <input
              type="text"
              value={filename()}
              onInput={(e) => setFilename(e.currentTarget.value)}
              class="w-full px-3 py-1.5 rounded-lg border border-rim bg-elevated text-sm text-txt
                     focus:outline-none focus:border-accent"
            />
          </label>

          <div class="flex-1 min-h-0 flex flex-col">
            <span class="block text-xs text-muted mb-1">{t("editor.excalidraw_folder")}</span>
            {/* Destination is the folder you're standing in — same model as MoveCopyModal. */}
            <div class="flex-1 min-h-0 rounded-lg border border-rim p-2">
              <FilesPicker
                nick={props.nick}
                accept="files"
                selected={() => new Set<string>()}
                onToggle={() => {}}
                onFolderChange={setFolder}
              />
            </div>
          </div>

          <div class="shrink-0">
            <span class="block text-xs text-muted mb-1">{t("editor.excalidraw_acl")}</span>
            <AclPicker
              mode={mode()}
              onModeChange={setMode}
              allowEntries={allowKeys()}
              denyEntries={denyKeys()}
              onToggle={toggleEntry}
              onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
            />
          </div>

          <Show when={error()}>
            <p class="text-sm text-red-500">{error()}</p>
          </Show>
        </div>

        <footer class="flex items-center justify-between px-4 py-3 border-t border-rim bg-elevated shrink-0">
          <span class="text-xs text-muted truncate">
            /{folder().displayPath ? `${folder().displayPath}/` : ""}{filename().trim()}
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
              disabled={busy() || !filename().trim()}
              onClick={() => void save()}
              class="px-4 py-1.5 text-sm font-medium rounded-lg bg-accent text-accent-fg
                     hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {busy() ? t("editor.excalidraw_saving") : t("editor.excalidraw_save_cloud")}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
};

export default SaveToCloudDialog;
