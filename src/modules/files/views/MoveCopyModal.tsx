import { createSignal, createMemo, For, Show, type Component } from "solid-js";
import { MdFillFolder } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { listFolderMeta, moveItem, copyItem } from "../api";
import type { FileMeta } from "../api";
import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
import { EmptyState } from "@ui/EmptyState";

type Mode = "move" | "copy";
interface BreadcrumbEntry { name: string; hash: string; }

interface Props {
  /** One or many — the bulk selection bar reuses this modal with N items. */
  items: FileMeta[];
  nick: string;
  /** Called once every item has been attempted; `failed` is empty on success. */
  onDone: (failed: FileMeta[]) => void;
  onClose: () => void;
}

const MoveCopyModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const [mode, setMode] = createSignal<Mode>("move");
  const [crumbs, setCrumbs] = createSignal<BreadcrumbEntry[]>([]);
  const currentHash = () => crumbs()[crumbs().length - 1]?.hash ?? "";
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");

  // listFolderMeta, not listFolder: this shares the cache key "files-folder"
  // with the files widget, and two fetchers on one key must return the same
  // shape or whichever populates it first hands the other a payload it can't
  // read (an object where an array is expected, which throws mid-render).
  const [items] = createQueryResource(
    "files-folder",
    () => ({ nick: props.nick, hash: currentHash() }),
    ({ nick, hash }) => listFolderMeta(nick, hash),
  );

  // Folders only — and never a folder that is itself being moved, which would
  // ask the server to nest it inside itself.
  const moving = createMemo(() => new Set(props.items.map((i) => i.hash)));
  const folders = createMemo(() =>
    (items()?.items ?? []).filter((f) => f.is_dir && !moving().has(f.hash))
  );

  function enterFolder(folder: FileMeta) {
    setCrumbs((prev) => [...prev, { name: folder.filename, hash: folder.hash }]);
  }

  function navToCrumb(idx: number) {
    setCrumbs((prev) => (idx < 0 ? [] : prev.slice(0, idx + 1)));
  }

  // Only a no-op when EVERY selected item already lives here.
  const destinationIsSameFolder = () =>
    props.items.every((i) => i.folder === currentHash());
  // Moving into the folder the item already lives in is a no-op classic core's UI never allows either.
  const disableSubmit = createMemo(() => busy() || (mode() === "move" && destinationIsSameFolder()));

  async function submit() {
    setBusy(true);
    setErr("");
    // Sequential, not Promise.all: there is no batch endpoint, and firing N
    // concurrent writes at the same folder is how you get partial, interleaved
    // failures that are hard to report. One at a time, collect what failed.
    const failed: FileMeta[] = [];
    const op = mode() === "move" ? moveItem : copyItem;
    for (const item of props.items) {
      try {
        await op(props.nick, item.hash, currentHash());
      } catch {
        failed.push(item);
      }
    }
    setBusy(false);
    if (failed.length === props.items.length) {
      setErr(t("files_mod.bulk_partial_fail", {
        count: failed.length,
        names: failed.map((f) => f.filename).join(", "),
      }) as string);
      return;
    }
    props.onDone(failed);
  }

  return (
    <Modal onClose={props.onClose} class="z-[60]">
      <ModalPanel
        title={<>{t("files_mod.move_or_copy")} — <span class="font-normal text-muted"> {props.items.length === 1 ? props.items[0].filename : t("files_mod.selected_count", { count: props.items.length })} </span></>}
        onClose={props.onClose}
        size="md"
        class="flex flex-col h-[70vh] overflow-hidden"
      >
        {/* Move / Copy toggle */}
        <div class="flex border-b border-rim shrink-0 px-4 pt-2 gap-2">
          <ToggleButton active={mode() === "move"} label={t("files_mod.move_action") as string} onClick={() => setMode("move")} />
          <ToggleButton active={mode() === "copy"} label={t("files_mod.copy_action") as string} onClick={() => setMode("copy")} />
        </div>

        {/* Breadcrumb */}
        <div class="flex items-center gap-1 px-4 py-2 text-sm flex-wrap border-b border-rim shrink-0">
          <button
            onClick={() => navToCrumb(-1)}
            class={`hover:text-txt transition-colors ${crumbs().length === 0 ? "text-txt font-medium" : "text-accent"}`}
          >
            {t("files_mod.root_folder")}
          </button>
          <For each={crumbs()}>
            {(crumb, i) => (
              <>
                <span class="text-muted">/</span>
                <button
                  onClick={() => navToCrumb(i())}
                  class={`hover:text-txt transition-colors truncate max-w-[120px] ${
                    i() === crumbs().length - 1 ? "text-txt font-medium" : "text-accent"
                  }`}
                >
                  {crumb.name}
                </button>
              </>
            )}
          </For>
        </div>

        {/* Folder listing */}
        <div class="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
          <Show when={!items.loading} fallback={<EmptyState>…</EmptyState>}>
            <Show
              when={folders().length > 0}
              fallback={<EmptyState>{t("files_mod.folder_empty")}</EmptyState>}
            >
              <For each={folders()}>
                {(folder) => (
                  <button
                    onClick={() => enterFolder(folder)}
                    class="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-elevated transition-colors text-left"
                  >
                    <MdFillFolder class="w-5 h-5 text-accent shrink-0" />
                    <span class="text-sm text-txt truncate">{folder.filename}</span>
                  </button>
                )}
              </For>
            </Show>
          </Show>
        </div>

        <Show when={err()}>
          <p class="px-4 pb-2 text-sm text-danger-txt">{err()}</p>
        </Show>

        <footer class="flex items-center justify-between px-4 py-3 border-t border-rim bg-elevated shrink-0">
          {/* Say WHY the button is dead, or a disabled "Move here" at the
              folder you started in just reads as broken. */}
          <span class="text-xs text-muted truncate">
            {mode() === "move" && destinationIsSameFolder()
              ? t("files_mod.already_here")
              : t("files_mod.choose_destination")}
          </span>
          <div class="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              {t("files_mod.cancel")}
            </Button>
            <Button size="sm" disabled={disableSubmit()} onClick={submit}>
              {busy() ? t("files_mod.saving") : (mode() === "move" ? t("files_mod.move_here") : t("files_mod.copy_here"))}
            </Button>
          </div>
        </footer>
      </ModalPanel>
    </Modal>
  );
};

export default MoveCopyModal;

function ToggleButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
        props.active ? "border-accent text-txt" : "border-transparent text-muted hover:text-txt hover:border-rim"
      }`}
    >
      {props.label}
    </button>
  );
}
