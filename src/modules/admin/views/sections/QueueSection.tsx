import { createSignal, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import PageActions from "@/shared/views/layout/PageActions";
import { MdOutlineRefresh } from "solid-icons/md";
import { fetchAdminQueue, adminQueueAction } from "../../api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { DataTable } from "@ui/DataTable";
import type { DataTableColumn } from "@utsukta/spa-core/types/ui.types";

export default function QueueSection() {
  const { t } = useI18n();
  const [data, { refetch }] = createQueryResource("admin-queue", fetchAdminQueue);
  const [expert, setExpert] = createSignal(false);

  async function act(action: "drop" | "empty" | "deliver", posturl: string) {
    if (action === "drop" && !confirm(t("admin.queue_drophub_confirm"))) return;
    await adminQueueAction(action, posturl);
    refetch();
  }

  type QueueItem = NonNullable<ReturnType<typeof data>>["items"][number];
  const columns = (): DataTableColumn<QueueItem>[] => [
    {
      key: "dest",
      header: t("admin.col_destination"),
      class: "text-txt truncate",
      cell: (item) => <span title={item.outq_posturl}>{item.outq_posturl}</span>,
    },
    { key: "updated", header: t("admin.col_updated"), width: 8, class: "text-muted", cell: (item) => fmtDate(item.outq_updated) },
    { key: "priority", header: t("admin.col_priority"), width: 6, class: "text-muted", cell: (item) => item.outq_priority },
    ...(expert() ? [{
      key: "actions",
      header: "",
      width: 8,
      class: "flex justify-end gap-1",
      cell: (item: QueueItem) => (
        <For each={[
          ["deliver", t("admin.queue_deliverhub"), "↻"],
          ["empty", t("admin.queue_emptyhub"), "🗑"],
          ["drop", t("admin.queue_drophub"), "✕"],
        ] as const}>
          {([action, label, glyph]) => (
            <Button variant="ghost" size="sm" title={label} aria-label={label} onClick={() => act(action, item.outq_posturl)}>
              {glyph}
            </Button>
          )}
        </For>
      ),
    }] : []),
  ];

  return (
    <SubPageContent
      title={t("admin.queue_title")}
      description={t("admin.queue_desc")}
      action={<PageActions actions={[{ label: t("admin.refresh"), icon: MdOutlineRefresh, onClick: refetch }]} />}
    >
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
              </div>
            </div>

            <Show when={d().total === 0}>
              <p class="text-sm text-muted py-4 text-center">{t("admin.queue_empty")}</p>
            </Show>

            <Show when={d().items.length > 0}>
              <DataTable
                columns={columns()}
                rows={d().items}
                rowKey={(item) => item.outq_posturl}
                class="rounded-lg border border-rim"
              />
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
