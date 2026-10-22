// Chrome shared by the per-app config dialogs opened from the gear on an
// Integrations row (NSFW word list, Cards kanban). Body content is the caller's;
// everything around it — backdrop, header, close, save/cancel footer — is here
// so a second app config doesn't mean a second copy of it.

import { Show, type JSX } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";
import { Spinner } from "@ui/Spinner";

export default function ConfigModal(props: {
  title: string;
  description?: string;
  saving: boolean;
  /** Disables the save button (e.g. nothing loaded yet). */
  saveDisabled?: boolean;
  error?: string | null;
  onSave: () => void;
  onClose: () => void;
  children: JSX.Element;
}) {
  const { t } = useI18n();

  return (
    <Modal onClose={props.onClose} class="z-[60]">
      <ModalPanel
        title={props.title}
        description={props.description}
        onClose={props.onClose}
        size="md"
        class="overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          {props.children}
          <Show when={props.error}>
            <p class="text-xs text-danger-txt">{props.error}</p>
          </Show>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 border-t border-rim shrink-0">
          <div class="flex-1" />
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("directory.cancel")}
          </Button>
          <Button size="sm" onClick={props.onSave} disabled={props.saving || props.saveDisabled}>
            <Show when={props.saving}>
              <Spinner size="xs" />
            </Show>
            {props.saving ? t("settings.saving") : t("settings.save")}
          </Button>
        </div>
      </ModalPanel>
    </Modal>
  );
}
