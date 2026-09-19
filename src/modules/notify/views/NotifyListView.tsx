// src/modules/notify/views/NotifyListView.tsx
import { apiError } from "@utsukta/spa-core/lib/fetch";
import { For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import DOMPurify from "dompurify";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { markNotifySeen } from "@utsukta/spa-core/lib/markSeen";
import { resolveNotifyPath, connectionRequestId } from "@utsukta/spa-core/lib/notifyLink";
import { openConnectionRequestModal } from "@utsukta/spa-core/store/connection-request-modal";
import { relativeTime } from "@utsukta/spa-core/lib/relativeTime";
import { MdOutlineNotifications_none } from "solid-icons/md";

interface NotifyEntry {
  notify_id?: number;
  notify_link?: string;
  name?: string;
  photo?: string;
  when?: string;
  message?: string;
}

async function fetchAlerts(): Promise<NotifyEntry[]> {
  const res = await fetch("/sse_bs/notify", { credentials: "same-origin" });
  if (!res.ok) throw await apiError(res);
  const data: Record<string, { notifications?: NotifyEntry[] }> =
    await res.json();
  return data.notify?.notifications ?? [];
}

export default function NotifyListView() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [entries, { refetch }] = createQueryResource<NotifyEntry[]>(
    "notify-alerts",
    fetchAlerts,
    { initialValue: [] },
  );

  function open(entry: NotifyEntry) {
    if (entry.notify_id) markNotifySeen(entry.notify_id);
    const connId = connectionRequestId(entry.notify_link);
    if (connId) {
      openConnectionRequestModal(connId);
      return;
    }
    const path = resolveNotifyPath(entry.notify_link);
    if (path.startsWith("/")) {
      navigate(path);
    } else if (entry.notify_link) {
      window.location.assign(entry.notify_link);
    }
  }

  return (
    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div class="flex items-center gap-3">
        <MdOutlineNotifications_none class="w-5 h-5 text-accent shrink-0" />
        <h1 class="text-lg font-semibold text-txt">{t("notify.title")}</h1>
        <Show when={!entries.loading && (entries() ?? []).length > 0}>
          <span class="text-xs text-muted tabular-nums ml-auto">
            {(entries() ?? []).length}
          </span>
        </Show>
      </div>

      {/* Loading skeleton */}
      <Show when={entries.loading}>
        <div class="bg-surface border border-rim rounded-2xl overflow-hidden animate-pulse divide-y divide-rim">
          <For each={[1, 2, 3, 4]}>
            {() => (
              <div class="px-4 py-3 flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-elevated shrink-0" />
                <div class="h-3 bg-elevated rounded flex-1" />
                <div class="h-3 bg-elevated rounded w-10" />
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Error state */}
      <Show when={!entries.loading && entries.error}>
        <div class="flex flex-col items-center gap-2 py-16 text-muted">
          <p class="text-sm">{entries.error?.message}</p>
          <button
            onClick={() => refetch()}
            class="text-xs text-accent hover:underline"
          >
            {t("notify.retry")}
          </button>
        </div>
      </Show>

      {/* Empty state */}
      <Show
        when={!entries.loading && !entries.error && (entries() ?? []).length === 0}
      >
        <div class="flex flex-col items-center gap-3 py-16 text-muted">
          <MdOutlineNotifications_none class="w-10 h-10 opacity-30" />
          <p class="text-sm font-medium">{t("notify.empty")}</p>
        </div>
      </Show>

      {/* Alerts list */}
      <Show when={!entries.loading && (entries() ?? []).length > 0}>
        <div class="bg-surface border border-rim rounded-2xl overflow-hidden shadow-sm divide-y divide-rim">
          <For each={entries()}>
            {(entry) => (
              <button
                type="button"
                onClick={() => open(entry)}
                class="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-elevated transition-colors"
              >
                <Show when={entry.photo}>
                  <img
                    src={entry.photo}
                    alt={entry.name ?? ""}
                    class="w-8 h-8 rounded-full shrink-0 object-cover"
                  />
                </Show>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-txt leading-snug">
                    <Show when={entry.name}>
                      <span class="font-semibold">{entry.name} </span>
                    </Show>
                    <span
                      innerHTML={DOMPurify.sanitize(entry.message ?? "")}
                    />
                  </p>
                  <p class="text-xs text-muted mt-0.5">
                    {relativeTime(entry.when, t)}
                  </p>
                </div>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
