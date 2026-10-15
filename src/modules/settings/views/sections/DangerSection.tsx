import { Show, createSignal } from "solid-js";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { toast } from "@utsukta/spa-core/store/toast";
import SubPageContent from "@/shared/views/SubPageContent";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";

interface DangerData { nick: string; name: string; account_email: string; }

export default function DangerSection() {
  const { t } = useI18n();
  const query = useQuery(() => ({
    queryKey: ["settings", "danger"] as const,
    queryFn: async (): Promise<DangerData> => {
      const res = await apiFetch("/spa/settings/danger");
      const { data } = await res.json();
      return data;
    },
  }));
  const data = () => query.data;

  const [confirm, setConfirm] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const removeChannel = async () => {
    if (confirm() !== data()?.nick || !password()) return;
    setBusy(true);
    try {
      const res = await apiFetch("/spa/settings/danger", {
        method: "POST",
        body: JSON.stringify({ action: "remove_channel", password: password() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed");
      window.location.href = json.data?.redirect ?? "/";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      setBusy(false);
    }
  };

  return (
    <SubPageContent title={t("settings.title_danger")} description={t("settings.desc_danger")}>
      <Show when={data()}>
        <div class="space-y-6">

          {/* Remove channel */}
          <div class="rounded-xl border border-red-200 bg-red-50/50 dark:bg-red-900/10 p-5 space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-red-700">{t("settings.danger_remove_channel")}</h3>
              <p class="text-xs text-red-600 mt-1">
                Permanently deletes <strong>{data()!.name}</strong> (@{data()!.nick}) and all
                its posts, connections, and data. This cannot be undone.
              </p>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-medium text-red-700">
                {t("settings.danger_type_to_confirm").replace("{{nick}}", data()!.nick)}
              </label>
              <input
                type="text"
                value={confirm()}
                onInput={(e) => setConfirm(e.currentTarget.value)}
                placeholder={data()!.nick}
                class="w-full max-w-xs px-3 py-2 rounded-lg border border-red-300 bg-surface
                       text-txt text-sm outline-none focus:border-red-500 transition-colors"
              />
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-medium text-red-700">
                {t("settings.danger_password_label")}
              </label>
              <input
                type="password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder={t("settings.danger_password_placeholder")}
                autocomplete="current-password"
                class="w-full max-w-xs px-3 py-2 rounded-lg border border-red-300 bg-surface
                       text-txt text-sm outline-none focus:border-red-500 transition-colors"
              />
            </div>

            <button
              type="button"
              disabled={confirm() !== data()!.nick || !password() || busy()}
              onClick={removeChannel}
              class="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white
                     hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
            >
              {busy() ? t("settings.danger_removing") : t("settings.danger_remove_btn")}
            </button>
          </div>

        </div>
      </Show>
    </SubPageContent>
  );
}
