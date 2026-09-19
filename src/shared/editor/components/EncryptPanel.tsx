import { Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { useEncrypt } from "../useEncrypt";

type EncryptState = ReturnType<typeof useEncrypt>;

const EncryptPanel: Component<{ enc: EncryptState }> = (props) => {
  const { t } = useI18n();
  const e = props.enc;

  return (
    <div class="space-y-2">
      <span class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
        {t("editor.encrypt_panel_title")}
      </span>
      <div class="grid grid-cols-1 gap-2">
        <div class="flex flex-col gap-0.5">
          <label class="text-xs text-muted">{t("editor.encrypt_password_label")}</label>
          <input
            type="password"
            placeholder={t("editor.encrypt_password_placeholder")}
            value={e.password()}
            onInput={(ev) => e.setPassword(ev.currentTarget.value)}
            class="bg-transparent border border-rim rounded px-2.5 py-1 text-sm text-txt
                   placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
          />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="text-xs text-muted">{t("editor.encrypt_confirm_label")}</label>
          <input
            type="password"
            placeholder={t("editor.encrypt_confirm_placeholder")}
            value={e.confirm()}
            onInput={(ev) => e.setConfirm(ev.currentTarget.value)}
            class="bg-transparent border border-rim rounded px-2.5 py-1 text-sm text-txt
                   placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
          />
        </div>
      </div>
      <div class="flex flex-col gap-0.5">
        <label class="text-xs text-muted">{t("editor.encrypt_hint_label")}</label>
        <input
          type="text"
          placeholder={t("editor.encrypt_hint_placeholder")}
          value={e.hint()}
          onInput={(ev) => e.setHint(ev.currentTarget.value)}
          class="w-full bg-transparent border border-rim rounded px-2.5 py-1 text-sm text-txt
                 placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
        />
      </div>
      <Show when={e.error()}>
        <p class="text-red-400 text-xs">{e.error()}</p>
      </Show>
      <div class="flex gap-2 pt-1">
        <button
          type="button"
          disabled={e.encrypting()}
          onClick={() => void e.doEncrypt()}
          class="px-3 py-1 rounded-md text-xs font-semibold bg-accent text-accent-fg
                 hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {e.encrypting() ? t("editor.encrypt_encrypting") : t("editor.encrypt_btn")}
        </button>
        <button
          type="button"
          onClick={() => { e.setOpen(false); }}
          class="px-3 py-1 rounded-md text-xs text-muted hover:text-txt hover:bg-elevated transition-colors"
        >
          {t("editor.encrypt_cancel")}
        </button>
      </div>
    </div>
  );
};

export default EncryptPanel;
