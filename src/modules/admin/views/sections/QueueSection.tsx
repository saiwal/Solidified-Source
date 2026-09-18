import { createSignal, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminQueue, adminQueueAction } from "../../api";
import { useI18n } from "@utsukta/spa-core/i18n";

export default function QueueSection() {
  const { t } = useI18n();
  const [data, { refetch }] = createQueryResource("admin-queue", fetchAdminQueue);
  const [expert, setExpert] = createSignal(false);

  async function act(action: "drop" | "empty" | "deliver", posturl: string) {
    if (action === "drop" && !confirm(t("admin.queue_drophub_confirm"))) return;
    await adminQueueAction(action, posturl);
    refetch();
  }

  return (
    <SubPageContent title={t("admin.queue_title")} description={t("admin.queue_desc")}>
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <p class="text-sm text-muted">
                {d().total} {d().total !== 1 ? t("admin.undelivered_pl") : t("admin.undelivered")}
                {d().items.length < d().total ? ` (${t("admin.showing")} ${d().items.length})` : ""}
              </p>
              <div class="flex items-center gap-3">
              <label class="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={expert()}
                  onChange={(e) => setExpert(e.currentTarget.checked)}
                  class="accent-accent"
                />
                {t("admin.expert_mode")}
              </label>
              <button
                onClick={refetch}
                class="px-3 py-1.5 text-xs rounded-lg border border-rim text-txt hover:bg-elevated transition-colors"
              >
                {t("admin.refresh")}
              </button>
              </div>
            </div>

            <Show when={d().total === 0}>
              <p class="text-sm text-muted py-4 text-center">{t("admin.queue_empty")}</p>
            </Show>

            <Show when={d().items.length > 0}>
              <div class="rounded-lg border border-rim overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-rim bg-elevated">
                      <th class="px-3 py-2 text-left font-medium text-muted">{t("admin.col_destination")}</th>
                      <th class="px-3 py-2 text-left font-medium text-muted hidden sm:table-cell">{t("admin.col_updated")}</th>
                      <th class="px-3 py-2 text-left font-medium text-muted hidden md:table-cell">{t("admin.col_priority")}</th>
                      <Show when={expert()}>
                        <th class="px-3 py-2 text-left font-medium text-muted">{t("admin.col_actions")}</th>
                      </Show>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={d().items}>
                      {(item) => (
                        <tr class="border-b border-rim last:border-0 hover:bg-elevated/50 transition-colors">
                          <td class="px-3 py-2 text-txt truncate max-w-[16rem]" title={item.outq_posturl}>
                            {item.outq_posturl}
                          </td>
                          <td class="px-3 py-2 text-muted hidden sm:table-cell">{fmtDate(item.outq_updated)}</td>
                          <td class="px-3 py-2 text-muted hidden md:table-cell">{item.outq_priority}</td>
                          <Show when={expert()}>
                            <td class="px-3 py-2">
                              <div class="flex flex-wrap gap-1">
                                <For each={[
                                  ["deliver", t("admin.queue_deliverhub"), "↻"],
                                  ["empty", t("admin.queue_emptyhub"), "🗑"],
                                  ["drop", t("admin.queue_drophub"), "✕"],
                                ] as const}>
                                  {([action, label, glyph]) => (
                                    <button
                                      title={label}
                                      aria-label={label}
                                      onClick={() => act(action, item.outq_posturl)}
                                      class="px-2 py-1 rounded border border-rim text-txt hover:bg-elevated transition-colors"
                                    >
                                      {glyph}
                                    </button>
                                  )}
                                </For>
                              </div>
                            </td>
                          </Show>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

function fmtDate(s: string) {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function Skeleton() {
  return (
    <div class="space-y-2 animate-pulse">
      <div class="h-4 w-40 rounded bg-elevated" />
      <div class="rounded-lg border border-rim overflow-hidden">
        {Array.from({ length: 5 }, () => (
          <div class="h-8 border-b border-rim bg-elevated/30 last:border-0" />
        ))}
      </div>
    </div>
  );
}
