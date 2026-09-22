import { createSignal, createUniqueId, Show, type Component } from "solid-js";
import Modal from "@/shared/views/Modal";
import { useI18n } from "@utsukta/spa-core/i18n";
import { renameItem } from "../api";
import type { FileMeta } from "../api";

interface Props {
  item: FileMeta;
  nick: string;
  onRenamed: (updated: FileMeta) => void;
  onClose: () => void;
}

const RenameModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const titleId = createUniqueId();
  const [name, setName] = createSignal(props.item.filename);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");

  async function save(e: Event) {
    e.preventDefault();
    const trimmed = name().trim();
    if (!trimmed || trimmed === props.item.filename) {
      props.onClose();
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const updated = await renameItem(props.nick, props.item.hash, trimmed);
      props.onRenamed(updated);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-[60]">
      <form
        onSubmit={save}
        class="w-full max-w-sm rounded-xl border border-rim bg-surface shadow-2xl overflow-hidden"
      >
        <header class="flex items-center justify-between px-4 py-3 border-b border-rim">
          <span id={titleId} class="text-sm font-semibold text-txt">{t("files_mod.rename")}</span>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t("layout.close")}
            class="text-muted hover:text-txt text-lg leading-none"
          >
            ×
          </button>
        </header>
        <div class="p-4 space-y-3">
          <div>
            <label class="block text-xs text-muted mb-1">{t("files_mod.rename_label")}</label>
            <input
              type="text"
              autofocus
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              class="w-full px-3 py-2 rounded-lg border border-rim bg-surface text-sm text-txt
                     focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <Show when={err()}>
            <p class="text-sm text-red-500">{err()}</p>
          </Show>
        </div>
        <footer class="flex gap-2 px-4 py-3 border-t border-rim bg-elevated">
          <button
            type="submit"
            disabled={busy() || !name().trim()}
            class="px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-sm
                   disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {busy() ? t("files_mod.saving") : t("files_mod.save")}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            class="px-4 py-1.5 rounded-lg border border-rim text-sm text-muted
                   hover:bg-overlay transition-colors"
          >
            {t("files_mod.cancel")}
          </button>
        </footer>
      </form>
    </Modal>
  );
};

export default RenameModal;
