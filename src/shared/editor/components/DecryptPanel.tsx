import { Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { useEncrypt } from "../useEncrypt";
import { getPayloadHint, extractCryptPayload } from "@utsukta/spa-core/lib/postCrypto";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";

type EncryptState = ReturnType<typeof useEncrypt>;

// Passphrase-entry form for decrypting an already-encrypted body so it can be
// edited (see useEncrypt.ts's doDecrypt). Mirrors EncryptPanel.tsx's layout.
const DecryptPanel: Component<{ enc: EncryptState; body: () => string }> = (props) => {
  const { t } = useI18n();
  const e = props.enc;
  const hint = () => getPayloadHint(extractCryptPayload(props.body()));

  return (
    <div class="space-y-2">
      <span class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
        {t("editor.decrypt_panel_title")}
      </span>
      <Show when={hint()}>
        <p class="text-xs text-muted">{t("editor.decrypt_hint_prefix")} {hint()}</p>
      </Show>
      <div class="flex flex-col gap-0.5">
        <Input
          type="password"
          autofocus
          placeholder={t("editor.decrypt_passphrase")}
          value={e.decryptPassword()}
          onInput={(ev) => e.setDecryptPassword(ev.currentTarget.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter") void e.doDecrypt(); }}
        />
      </div>
      <Show when={e.decryptError()}>
        <p class="text-danger-txt text-xs">{e.decryptError()}</p>
      </Show>
      <div class="flex gap-2 pt-1">
        <Button size="sm" disabled={e.decrypting()} onClick={() => void e.doDecrypt()}>
          {e.decrypting() ? t("editor.decrypt_decrypting") : t("editor.decrypt_btn")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => e.resetDecrypt()}>
          {t("editor.decrypt_cancel")}
        </Button>
      </div>
    </div>
  );
};

export default DecryptPanel;
