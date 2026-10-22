import { Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { useEncrypt } from "../useEncrypt";
import { Button } from "@ui/Button";
import { Field, Input } from "@ui/Field";

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
          <Field label={t("editor.encrypt_password_label")} size="sm">
            <Input
            type="password"
            placeholder={t("editor.encrypt_password_placeholder")}
            value={e.password()}
            onInput={(ev) => e.setPassword(ev.currentTarget.value)}
            />
          </Field>
        </div>
        <div class="flex flex-col gap-0.5">
          <Field label={t("editor.encrypt_confirm_label")} size="sm">
            <Input
            type="password"
            placeholder={t("editor.encrypt_confirm_placeholder")}
            value={e.confirm()}
            onInput={(ev) => e.setConfirm(ev.currentTarget.value)}
            />
          </Field>
        </div>
      </div>
      <div class="flex flex-col gap-0.5">
        <Field label={t("editor.encrypt_hint_label")} size="sm">
          <Input
          class="w-full"
          type="text"
          placeholder={t("editor.encrypt_hint_placeholder")}
          value={e.hint()}
          onInput={(ev) => e.setHint(ev.currentTarget.value)}
          />
        </Field>
      </div>
      <Show when={e.error()}>
        <p class="text-danger-txt text-xs">{e.error()}</p>
      </Show>
      <div class="flex gap-2 pt-1">
        <Button size="sm" disabled={e.encrypting()} onClick={() => void e.doEncrypt()}>
          {e.encrypting() ? t("editor.encrypt_encrypting") : t("editor.encrypt_btn")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { e.setOpen(false); }}>
          {t("editor.encrypt_cancel")}
        </Button>
      </div>
    </div>
  );
};

export default EncryptPanel;
