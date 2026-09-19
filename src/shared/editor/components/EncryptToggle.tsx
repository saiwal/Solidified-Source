import { Show, lazy, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isEncryptedBody } from "@utsukta/spa-core/lib/postCrypto";
import type { useEncrypt } from "../useEncrypt";
import { PopoverButton } from "./buttons";

const EncryptPanel = lazy(() => import("./EncryptPanel"));
const DecryptPanel = lazy(() => import("./DecryptPanel"));

type EncryptState = ReturnType<typeof useEncrypt>;

// Replaces each composer's duplicated "Encrypt toggle / 🔒 Encrypted badge"
// block. Not-yet-encrypted body → the existing Encrypt toggle. Already
// encrypted → a clickable "Decrypt to edit" button (see useEncrypt.ts's
// doDecrypt) instead of an inert badge, since there was previously no way to
// modify existing encrypted content short of decrypting it elsewhere first.
//
// Both forms hang off the button as a popover rather than as a full-width band
// in the composer body: they are occasional, and a permanent section cost every
// composer a row of height it needed for the editor. The panels live here now,
// so a composer only places this one control.
const EncryptToggle: Component<{ enc: EncryptState; body: () => string }> = (props) => {
  const { t } = useI18n();
  const e = props.enc;

  return (
    <Show
      when={!isEncryptedBody(props.body())}
      fallback={
        <PopoverButton
          title={t("editor.decrypt_toggle")}
          open={e.decryptOpen}
          setOpen={e.setDecryptOpen}
          icon={<span aria-hidden="true">🔒</span>}
        >
          <DecryptPanel enc={e} body={props.body} />
        </PopoverButton>
      }
    >
      <PopoverButton
        title={t("editor.encrypt_toggle")}
        open={e.open}
        setOpen={e.setOpen}
        icon={
          <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        }
      >
        <EncryptPanel enc={e} />
      </PopoverButton>
    </Show>
  );
};

export default EncryptToggle;
