// "Your hub has saved sign-ins — unlock them here": shown on /jellyfin when
// the hub's vault exists but this browser hasn't unlocked it yet.
import { Show, createSignal } from "solid-js";
import { MdOutlineLock } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { unlockVault } from "@utsukta/spa-core/lib/vault";
import { vaultLocked, resyncFromHub, hubSyncError } from "./store";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";

const [dismissed, setDismissed] = createSignal(false);

export default function VaultUnlock() {
  const { t } = useI18n();
  const [pass, setPass] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [wrong, setWrong] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setWrong(false);
    const ok = await unlockVault(pass()).catch(() => false);
    setBusy(false);
    if (!ok) return void setWrong(true);
    setPass("");
    await resyncFromHub();
  };

  return (
    <>
    {/* Unlocked, but this browser still couldn't sign in to a stored server: say why */}
    <Show when={hubSyncError()}>
      {(e) => (
        <div class="space-y-1 p-4 rounded-2xl bg-elevated/40 text-sm">
          <p class="text-txt">
            {e().kind === "revoked" ? t("jellyfin.hub_err_revoked", { server: e().name })
              : e().kind === "off" ? t("jellyfin.hub_err_off", { server: e().name })
              : e().kind === "empty" ? t("jellyfin.hub_err_empty")
              : e().kind === "unreadable" ? t("jellyfin.hub_err_unreadable", { n: e().detail })
              : t("jellyfin.hub_err_failed", { server: e().name })}
          </p>
          <Show when={e().kind === "failed" || e().kind === "revoked"}>
            <p class="text-xs text-muted">{e().detail}</p>
          </Show>
        </div>
      )}
    </Show>
    <Show when={vaultLocked() && !dismissed()}>
      <form onSubmit={submit} class="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-elevated/40">
        <MdOutlineLock size={20} class="text-muted shrink-0" />
        <p class="text-sm text-txt flex-1 basis-56">{t("jellyfin.vault_locked")}</p>
        <Input
          class="w-44"
          type="password"
          value={pass()}
          onInput={(e) => setPass(e.currentTarget.value)}
          required
          placeholder={t("jellyfin.vault_passphrase")}
          aria-label={t("jellyfin.vault_passphrase")}
          autocomplete="current-password"
        />
        <Button type="submit" disabled={busy()}>{t("jellyfin.vault_unlock")}</Button>
        <Button variant="ghost" onClick={() => setDismissed(true)}>{t("jellyfin.vault_not_now")}</Button>
        <Show when={wrong()}><p class="basis-full text-sm text-danger-txt">{t("jellyfin.vault_wrong")}</p></Show>
      </form>
    </Show>
    </>
  );
}
