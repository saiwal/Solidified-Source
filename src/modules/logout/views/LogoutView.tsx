import { onMount } from "solid-js";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { clearOfflineData } from "@utsukta/spa-core/lib/offline-fallback";
import { clearMessageStore } from "@utsukta/spa-core/lib/message-store";
import { forgetMatrix } from "@/modules/messenger/matrix-session";
import { forgetJellyfin } from "@/modules/jellyfin/api";
import { forgetVault } from "@utsukta/spa-core/lib/vault";
import { useI18n } from "@utsukta/spa-core/i18n";

export default function LogoutView() {
  const { t } = useI18n();
  onMount(async () => {
    try {
      const csrf = await getCsrfToken();
      await fetch("/spa/logout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({}),
      });
    } catch {
      // ignore — redirect regardless
    }
    // Even if the POST failed: the user asked to leave this device.
    forgetJellyfin();
    await Promise.all([clearOfflineData(), clearMessageStore(), forgetMatrix(), forgetVault()]).catch(() => {});
    window.location.href = "/login";
  });

  return (
    <div class="min-h-[60vh] flex items-center justify-center">
      <p class="text-sm text-muted">{t("auth.signing_out")}</p>
    </div>
  );
}
