// Settings for the social side of the player: profile now-playing audience,
// the daily recap reminder, and the recap posts themselves.
import { For, Show, createEffect, createSignal } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { MdFillClose } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { toast } from "@utsukta/spa-core/store/toast";
import PostComposer from "@/shared/editor/composers/PostComposer";
import { audience, audienceLoaded, loadAudience, setAudience, reminder, setReminder, setSettingsOpen, type Audience } from "./settings";
import { buildRecap, type RecapPeriod } from "./recap";
import { vaultStatus, lockVault, resetVault, type VaultStatus } from "@utsukta/spa-core/lib/vault";
import { resyncFromHub } from "./store";
import { ghostPill } from "./ui";

const AUDIENCES: Audience[] = ["off", "self", "connections", "public"];
const AUDIENCE_LABEL = {
  off: "jellyfin.np_off",
  self: "jellyfin.np_self",
  connections: "jellyfin.np_connections",
  public: "jellyfin.np_public",
} as const;

/** Opens the composer with a recap draft. Also answers ?recap=day|week (the reminder toast). */
export function useRecapComposer() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [body, setBody] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const open = async (period: RecapPeriod) => {
    if (busy()) return;
    setBusy(true);
    const text = await buildRecap(period, t).catch(() => null);
    setBusy(false);
    if (text) setBody(text);
    else toast.info(t("jellyfin.recap_empty"));
  };

  createEffect(() => {
    const p = params.recap;
    if (p === "day" || p === "week") {
      setParams({ recap: undefined }, { replace: true });
      void open(p);
    }
  });

  const Composer = () => {
    const auth = useAuth();
    return (
      <Show when={body()}>
        {(b) => (
          <PostComposer open={true} onClose={() => setBody(null)} onPosted={() => setBody(null)}
            profileUid={auth()?.uid ?? 0} initialBody={b()} scopeKey="jellyfin:recap" />
        )}
      </Show>
    );
  };
  return { open, busy, Composer };
}

export default function SettingsPanel(props: { recap: ReturnType<typeof useRecapComposer> }) {
  const { t } = useI18n();
  void loadAudience();
  const field = "bg-transparent border-0 border-b border-rim focus:border-accent outline-none py-1 pr-6 text-sm text-txt";

  return (
    <section class="w-full max-w-md space-y-6 p-6 rounded-3xl bg-surface shadow-2xl">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold text-txt">{t("jellyfin.settings")}</h2>
        <button type="button" title={t("jellyfin.cancel")} onClick={() => setSettingsOpen(false)} class="p-1 text-muted hover:text-txt">
          <MdFillClose size={18} />
        </button>
      </div>

      <div class="space-y-1">
        <label class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm text-txt">{t("jellyfin.np_label")}</span>
          <select class={field} value={audience()} disabled={!audienceLoaded()}
            onChange={async (e) => {
              if (!(await setAudience(e.currentTarget.value as Audience))) toast.error(t("jellyfin.save_failed"));
            }}>
            <For each={AUDIENCES}>{(a) => <option value={a}>{t(AUDIENCE_LABEL[a])}</option>}</For>
          </select>
        </label>
        <p class="text-xs text-muted">{t("jellyfin.np_help")}</p>
      </div>

      <div class="space-y-1">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-2 text-sm text-txt">
            <input type="checkbox" checked={reminder().enabled}
              onChange={(e) => setReminder({ enabled: e.currentTarget.checked })} />
            {t("jellyfin.reminder_label")}
          </label>
          <select class={field} value={String(reminder().hour)} disabled={!reminder().enabled}
            onChange={(e) => setReminder({ hour: Number(e.currentTarget.value) })}
            aria-label={t("jellyfin.reminder_time")}>
            <For each={Array.from({ length: 24 }, (_, h) => h)}>
              {(h) => <option value={String(h)}>{`${String(h).padStart(2, "0")}:00`}</option>}
            </For>
          </select>
        </div>
        <p class="text-xs text-muted">{t("jellyfin.reminder_help")}</p>
      </div>

      <VaultSettings />

      <div class="flex flex-wrap gap-2 pt-2">
        <button type="button" disabled={props.recap.busy()} onClick={() => void props.recap.open("day")}
          class={ghostPill}>
          {t("jellyfin.recap_day")}
        </button>
        <button type="button" disabled={props.recap.busy()} onClick={() => void props.recap.open("week")}
          class={ghostPill}>
          {t("jellyfin.recap_week")}
        </button>
      </div>
    </section>
  );
}

/** Vault: lock this browser, or reset after a forgotten passphrase. */
function VaultSettings() {
  const { t } = useI18n();
  const [status, setStatus] = createSignal<VaultStatus | null>(null);
  const [confirming, setConfirming] = createSignal(false);
  const refresh = () => vaultStatus().then(setStatus).catch(() => setStatus(null));
  void refresh();
  return (
    <Show when={status() && status() !== "new"}>
      <div class="space-y-2">
        <p class="text-sm text-txt">{t("jellyfin.vault_title")}</p>
        <p class="text-xs text-muted">{t("jellyfin.vault_settings_help")}</p>
        <div class="flex flex-wrap gap-2">
          <Show when={status() === "unlocked"}>
            <button type="button" class={ghostPill} onClick={() => void lockVault().then(refresh)}>{t("jellyfin.vault_lock")}</button>
          </Show>
          <Show when={!confirming()} fallback={
            <>
              <span class="text-sm text-red-500 self-center">{t("jellyfin.vault_reset_confirm")}</span>
              <button type="button" class={ghostPill} onClick={() => setConfirming(false)}>{t("jellyfin.cancel")}</button>
              <button type="button" class={`${ghostPill} !text-red-500`} onClick={async () => {
                await resetVault(["jellyfin"]).catch(() => toast.error(t("jellyfin.save_failed")));
                setConfirming(false);
                await refresh();
                void resyncFromHub();
              }}>{t("jellyfin.vault_reset")}</button>
            </>
          }>
            <button type="button" class={ghostPill} onClick={() => setConfirming(true)}>{t("jellyfin.vault_reset")}</button>
          </Show>
        </div>
      </div>
    </Show>
  );
}
