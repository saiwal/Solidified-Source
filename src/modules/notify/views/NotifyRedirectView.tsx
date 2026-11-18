// src/modules/notify/views/NotifyRedirectView.tsx
import { createSignal, Show, createEffect } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { resolveNotify } from "../api";
import { resolveNotifyPath, connectionRequestId } from "@utsukta/spa-core/lib/notifyLink";
import { openConnectionRequestModal } from "@utsukta/spa-core/store/connection-request-modal";

export default function NotifyRedirectView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [notFound, setNotFound] = createSignal(false);

  let started = false;
  createEffect(() => params.id, (id) => {
    if (!id || started) return;
    started = true;
    resolveNotify(id)
      .then(({ link }) => {
        // This view is just a landing spinner for a deep-linked notify id — a
        // connection request opens its accept/reject modal over the app's
        // normal home instead of dropping the user onto the connections list.
        const connId = connectionRequestId(link);
        if (connId) {
          openConnectionRequestModal(connId);
          navigate("/", { replace: true });
          return;
        }
        const path = resolveNotifyPath(link);
        if (path.startsWith("/")) {
          navigate(path, { replace: true });
        } else {
          window.location.assign(link);
        }
      })
      .catch(() => setNotFound(true));
  });

  return (
    <div class="max-w-3xl mx-auto px-4 py-16 flex flex-col items-center gap-3 text-muted">
      <Show
        when={!notFound()}
        fallback={
          <>
            <p class="text-sm font-medium">{t("notify.not_found")}</p>
            <a href="/notify" class="text-xs text-accent hover:underline">
              {t("notify.back")}
            </a>
          </>
        }
      >
        <svg
          class="w-5 h-5 animate-spin text-accent"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
        <p class="text-sm">{t("notify.resolving")}</p>
      </Show>
    </div>
  );
}
