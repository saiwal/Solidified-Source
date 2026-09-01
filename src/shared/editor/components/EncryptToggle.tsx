import { Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isEncryptedBody } from "@utsukta/spa-core/lib/postCrypto";
import type { useEncrypt } from "../useEncrypt";
import { ToggleButton } from "./buttons";

type EncryptState = ReturnType<typeof useEncrypt>;

// Replaces each composer's duplicated "Encrypt toggle / 🔒 Encrypted badge"
// block. Not-yet-encrypted body → the existing Encrypt toggle. Already
// encrypted → a clickable "Decrypt to edit" button (see useEncrypt.ts's
// doDecrypt) instead of an inert badge, since there was previously no way to
// modify existing encrypted content short of decrypting it elsewhere first.
const EncryptToggle: Component<{ enc: EncryptState; body: () => string }> = (props) => {
  const { t } = useI18n();
  const e = props.enc;

  return (
    <Show
      when={!isEncryptedBody(props.body())}
      fallback={
        <button
          type="button"
          onClick={() => e.setDecryptOpen((o) => !o)}
          class="flex items-center gap-1 px-2 py-1 rounded-md text-xs border bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:brightness-110 transition-all"
        >
          🔒 {t("editor.encrypt_badge")} · {t("editor.decrypt_toggle")}
        </button>
      }
    >
      <ToggleButton
        active={e.open()}
        onClick={() => e.setOpen((o) => !o)}
        title={t("editor.encrypt_toggle")}
      >
        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      </ToggleButton>
    </Show>
  );
};

export default EncryptToggle;
