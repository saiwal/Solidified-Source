import { Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminDbUpdates } from "../../api";
import type { DbUpdate } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { DataTable } from "@ui/DataTable";
import type { DataTableColumn } from "@utsukta/spa-core/types/ui.types";

export default function DbUpdatesSection() {
  const { t } = useI18n();
  const [updates] = createQueryResource("admin-db-updates", fetchAdminDbUpdates);

  return (
    <SubPageContent title={t("admin.db_title")} description={t("admin.db_desc")}>
      <Show when={updates()} fallback={<Skeleton />}>
        {(list) => (
          <div class="space-y-3">
            <p class="text-sm text-muted">{list().length} {t("admin.records")}</p>

            <Show when={list().length === 0}>
              <p class="text-sm text-muted py-4 text-center">{t("admin.no_db_records")}</p>
            </Show>

            <Show when={list().length > 0}>
              <DataTable
                columns={dbColumns(list()[0])}
                rows={list()}
                rowKey={(row) => Object.values(row).join("|")}
                class="rounded-lg border border-rim"
              />
            </Show>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

function dbColumns(sample: DbUpdate | undefined): DataTableColumn<DbUpdate>[] {
  return Object.keys(sample ?? {}).map((key) => ({
    key,
    header: key,
    class: "text-xs truncate",
    cell: (row) => String(row[key] ?? "—"),
  }));
}

function Skeleton() {
  return (
    <div class="space-y-2 animate-pulse">
      <div class="h-4 w-32 rounded bg-elevated" />
      <div class="rounded-lg border border-rim overflow-hidden">
        {Array.from({ length: 5 }, () => (
          <div class="h-8 border-b border-rim bg-elevated/30 last:border-0" />
        ))}
      </div>
    </div>
  );
}
