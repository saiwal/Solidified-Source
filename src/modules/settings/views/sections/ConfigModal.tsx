// Chrome shared by the per-app config dialogs opened from the gear on an
// Integrations row (NSFW word list, Cards kanban). Body content is the caller's;
// everything around it — backdrop, header, close, save/cancel footer — is here
// so a second app config doesn't mean a second copy of it.

import { Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { useI18n } from "@utsukta/spa-core/i18n";

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
    <Portal>
      <div
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class="w-full max-w-md rounded-2xl bg-surface border border-rim shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
          <div class="flex items-center gap-3 p-4 border-b border-rim shrink-0">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-sm text-txt truncate">{props.title}</div>
              <Show when={props.description}>
                <div class="text-xs text-muted truncate">{props.description}</div>
              </Show>
            </div>
            <button
              onClick={props.onClose}
              class="p-1.5 rounded-lg text-muted hover:text-txt hover:bg-overlay transition-colors shrink-0"
              aria-label={t("post.modal_close")}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto p-4 space-y-3">
            {props.children}
            <Show when={props.error}>
              <p class="text-xs text-red-500">{props.error}</p>
            </Show>
          </div>

          <div class="flex items-center gap-2 px-4 py-3 border-t border-rim shrink-0">
            <div class="flex-1" />
            <button
              onClick={props.onClose}
              class="px-3 py-1.5 rounded-lg text-xs border border-rim text-muted
                     hover:bg-overlay transition-colors"
            >
              {t("directory.cancel")}
            </button>
            <button
              onClick={props.onSave}
              disabled={props.saving || props.saveDisabled}
              class="px-3 py-1.5 rounded-lg text-xs border border-rim text-muted
                     hover:border-accent hover:text-accent transition-colors
                     disabled:opacity-50 disabled:cursor-default flex items-center gap-1.5"
            >
              <Show when={props.saving}>
                <span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              </Show>
              {props.saving ? t("settings.saving") : t("settings.save")}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
