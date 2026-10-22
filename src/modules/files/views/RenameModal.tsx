import { createSignal, createUniqueId, Show, type Component } from "solid-js";
import { Modal, modalPanelClass } from "@ui/Modal";
import { useI18n } from "@utsukta/spa-core/i18n";
import { renameItem } from "../api";
import type { FileMeta } from "../api";
import { Button } from "@ui/Button";
import { Field, Input } from "@ui/Field";

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
        class={`${modalPanelClass("sm")} overflow-hidden`}
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
            <Field label={t("files_mod.rename_label")} size="sm">
              <Input
              class="w-full"
              type="text"
              autofocus
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              />
            </Field>
          </div>
          <Show when={err()}>
            <p class="text-sm text-danger-txt">{err()}</p>
          </Show>
        </div>
        <footer class="flex gap-2 px-4 py-3 border-t border-rim bg-elevated">
          <Button size="sm" type="submit" disabled={busy() || !name().trim()}>
            {busy() ? t("files_mod.saving") : t("files_mod.save")}
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("files_mod.cancel")}
          </Button>
        </footer>
      </form>
    </Modal>
  );
};

export default RenameModal;
