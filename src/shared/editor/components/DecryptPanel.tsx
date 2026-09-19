import { Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { useEncrypt } from "../useEncrypt";
import { getPayloadHint, extractCryptPayload } from "@utsukta/spa-core/lib/postCrypto";

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
        <input
          type="password"
          autofocus
          placeholder={t("editor.decrypt_passphrase")}
          value={e.decryptPassword()}
          onInput={(ev) => e.setDecryptPassword(ev.currentTarget.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter") void e.doDecrypt(); }}
          class="bg-transparent border border-rim rounded px-2.5 py-1 text-sm text-txt
                 placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
        />
      </div>
      <Show when={e.decryptError()}>
        <p class="text-red-400 text-xs">{e.decryptError()}</p>
      </Show>
      <div class="flex gap-2 pt-1">
        <button
          type="button"
          disabled={e.decrypting()}
          onClick={() => void e.doDecrypt()}
          class="px-3 py-1 rounded-md text-xs font-semibold bg-accent text-accent-fg
                 hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {e.decrypting() ? t("editor.decrypt_decrypting") : t("editor.decrypt_btn")}
        </button>
        <button
          type="button"
          onClick={() => e.resetDecrypt()}
          class="px-3 py-1 rounded-md text-xs text-muted hover:text-txt hover:bg-elevated transition-colors"
        >
          {t("editor.decrypt_cancel")}
        </button>
      </div>
    </div>
  );
};

export default DecryptPanel;
