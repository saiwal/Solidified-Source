import { createSignal, createEffect, For, Show, batch } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import PageActions from "@/shared/views/layout/PageActions";
import { MdOutlineRefresh } from "solid-icons/md";
import { fetchAdminQueueworker, saveQueueworkerSettings } from "../../api";
import type { QueueworkerSettings, WorkerJob } from "../../types";
import { Button } from "@ui/Button";
import { Field, Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { DataTable } from "@ui/DataTable";
import type { DataTableColumn } from "@utsukta/spa-core/types/ui.types";

const JOB_COLUMNS: DataTableColumn<WorkerJob>[] = [
  { key: "id", header: "ID", width: 5, class: "text-xs font-mono text-muted", cell: (job) => job.id },
  {
    key: "cmd",
    header: "Command",
    class: "text-xs font-mono text-txt truncate",
    cell: (job) => job.cmd || "—",
  },
  { key: "priority", header: "Priority", width: 6, class: "text-xs text-muted", cell: (job) => job.priority },
  {
    key: "status",
    header: "Status",
    width: 6,
    class: "text-xs",
    cell: (job) => (
      <Show when={job.reservation_id} fallback={<span class="text-muted">queued</span>}>
        <span class="text-warning-txt">active</span>
      </Show>
    ),
  },
];

export default function QueueworkerSection() {
  const [data, { refetch }] = createQueryResource("admin-queueworker", fetchAdminQueueworker);

  // Settings state seeded from loaded data
  const [settings, setSettings] = createSignal<QueueworkerSettings>({
    max_queueworkers: 4,
    queueworker_max_age: 300,
    queue_worker_sleep: 100,
    auto_queue_worker_sleep: 0,
  });
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);

  createEffect(() => {
    const d = data();
    if (d) setSettings(d.settings);
  });

  function setSetting<K extends keyof QueueworkerSettings>(k: K, v: QueueworkerSettings[K]) {
    setSettings((p) => ({ ...p, [k]: v }));
  }

  async function onSave() {
    setSaving(true);
    try {
      await saveQueueworkerSettings(settings());
      batch(() => { setSaving(false); setSaved(true); });
      setTimeout(() => setSaved(false), 2000);
      refetch();
    } catch { setSaving(false); }
  }

  return (
    <SubPageContent
      title="Queue Worker"
      description="Monitor queue status and configure worker settings."
      action={
        <PageActions actions={[{ label: "Refresh", icon: MdOutlineRefresh, onClick: refetch }]} />
      }
    >
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <div class="space-y-6">
            {/* Status cards */}
            <div class="grid grid-cols-2 gap-3">
              <StatCard
                label="Queue items"
                value={d().total}
                accent={d().total > 0}
              />
              <StatCard
                label="Active workers"
                value={d().active_workers}
                accent={d().active_workers > 0}
              />
            </div>

            {/* Work items by command */}
            <Show when={d().by_command.length > 0}>
              <div class="space-y-2">
                <p class="text-xs font-semibold text-muted uppercase tracking-wider">By command</p>
                <div class="rounded-lg border border-rim overflow-hidden divide-y divide-rim">
                  <For each={d().by_command}>
                    {(row) => (
                      <div class="flex items-center justify-between px-3 py-2 hover:bg-elevated/50 transition-colors">
                        <span class="text-sm font-mono text-txt truncate">{row.cmd || "—"}</span>
                        <span class="text-xs text-muted shrink-0 ml-4">{row.total}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            {/* Settings form */}
            <Card class="p-4 space-y-4">
              <p class="text-sm font-semibold text-txt">Worker Settings</p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <NumberField
                  label="Max worker threads"
                  hint="Minimum 4"
                  value={settings().max_queueworkers}
                  min={4}
                  onChange={(v) => setSetting("max_queueworkers", v)}
                />
                <NumberField
                  label="Assume workers dead after"
                  hint="Minimum 120 seconds"
                  value={settings().queueworker_max_age}
                  min={120}
                  onChange={(v) => setSetting("queueworker_max_age", v)}
                />
                <NumberField
                  label="Pause before next task"
                  hint="Minimum 100 microseconds"
                  value={settings().queue_worker_sleep}
                  min={100}
                  disabled={settings().auto_queue_worker_sleep === 1}
                  onChange={(v) => setSetting("queue_worker_sleep", v)}
                />
                <label class="flex items-start gap-2.5 cursor-pointer select-none pt-5">
                  <input
                    type="checkbox"
                    checked={settings().auto_queue_worker_sleep === 1}
                    onChange={(e) => setSetting("auto_queue_worker_sleep", e.currentTarget.checked ? 1 : 0)}
                    class="mt-0.5 h-4 w-4 rounded border-rim accent-[var(--color-accent)]"
                  />
                  <div>
                    <p class="text-sm text-txt">Auto-adjust pause</p>
                    <p class="text-xs text-muted">Automatically tune the inter-task delay</p>
                  </div>
                </label>
              </div>

              <div class="flex items-center gap-3 justify-end pt-1">
                <Show when={saved()}>
                  <span class="text-xs text-success-txt">Saved</span>
                </Show>
                <Button size="sm" onClick={onSave} disabled={saving()}>
                  {saving() ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </Card>

            {/* Jobs table */}
            <Show when={d().jobs.length > 0}>
              <div class="space-y-2">
                <p class="text-xs font-semibold text-muted uppercase tracking-wider">
                  Queued jobs ({d().jobs.length})
                </p>
                <DataTable
                  columns={JOB_COLUMNS}
                  rows={d().jobs}
                  rowKey={(job) => job.id}
                  class="rounded-lg border border-rim"
                />
              </div>
            </Show>

            <Show when={d().total === 0}>
              <p class="text-sm text-muted text-center py-4">Queue is empty.</p>
            </Show>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

function StatCard(props: { label: string; value: number; accent?: boolean }) {
  return (
    <div class={`rounded-lg border p-4 text-center ${props.accent && props.value > 0 ? "border-accent/40 bg-accent/5" : "border-rim bg-surface"}`}>
      <p class={`text-2xl font-bold ${props.accent && props.value > 0 ? "text-accent" : "text-txt"}`}>
        {props.value}
      </p>
      <p class="text-xs text-muted mt-1">{props.label}</p>
    </div>
  );
}

function NumberField(props: {
  label: string;
  hint: string;
  value: number;
  min: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div class="space-y-1">
      <Field label={props.label} hint={props.hint} size="sm">
        <Input
        class="w-full"
        type="number"
        value={props.value}
        min={props.min}
        disabled={props.disabled}
        onInput={(e) => props.onChange(parseInt(e.currentTarget.value) || props.min)}
        />
      </Field>
    </div>
  );
}

function Skeleton() {
  return (
    <div class="space-y-4 animate-pulse">
      <div class="grid grid-cols-2 gap-3">
        <div class="h-20 rounded-lg border border-rim bg-elevated/30" />
        <div class="h-20 rounded-lg border border-rim bg-elevated/30" />
      </div>
      <div class="h-32 rounded-lg border border-rim bg-elevated/30" />
      <div class="h-48 rounded-lg border border-rim bg-elevated/30" />
    </div>
  );
}
