/**
 * TasksWidget.tsx
 * Your to-dos from the channel task list (core's Tasklist, iCal VTODO
 * imports) and every enabled CalDAV calendar, in one list: tick to complete,
 * add to either store, delete. Owner only — tasks are always private.
 */
import { createMemo, createSignal, For, Show } from "solid-js";
import { MdOutlineDelete } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { toast } from "@utsukta/spa-core/store/toast";
import { Card } from "@ui/Card";
import { Button, IconButton } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { fetchTasks, createTask, toggleTask, editTask, taskRef, type Task } from "../api/tasks";
import { fetchCdavCalendars } from "../api/cdav";
import { deleteEvent } from "../api";

// 1–4 high, 5 medium, 6–9 low (RFC 5545 §3.8.1.9); 0 = unset.
const PRIO = (p: number) => (!p ? null : p <= 4 ? "high" : p === 5 ? "medium" : "low");

const taskKey = (t: Task) => (t.source === "channel" ? `c${t.id}` : `${t.calendarId}/${t.uri}`);

/** None / High / Medium / Low — plus the task's own value when an import set
 *  one in between (PRIORITY:3), so opening the editor doesn't reset it. */
function PrioritySelect(props: { value: number; onChange: (n: number) => void }) {
  const { t } = useI18n();
  const opts = () => [...new Set([0, 1, 5, 9, props.value])].sort((a, b) => (a || 10) - (b || 10));
  return (
    <Select size="sm" value={String(props.value)} onChange={(e) => props.onChange(Number(e.currentTarget.value))}
      aria-label={t("calendar.tasks_priority")}>
      <For each={opts()}>
        {(n) => <option value={String(n)}>{n ? t(`calendar.tasks_prio_${PRIO(n)}` as any) : t("calendar.tasks_priority")}</option>}
      </For>
    </Select>
  );
}

function TaskEditor(props: { task: Task; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const [summary, setSummary] = createSignal(props.task.summary);
  const [due, setDue] = createSignal(props.task.due ?? "");
  const [priority, setPriority] = createSignal(props.task.priority);
  const [busy, setBusy] = createSignal(false);

  async function save(e: Event) {
    e.preventDefault();
    if (!summary().trim() || busy()) return;
    setBusy(true);
    try {
      await editTask(props.task, { summary: summary().trim(), due: due() || undefined, priority: priority() });
      await props.onSaved();
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} onKeyDown={(e) => e.key === "Escape" && props.onClose()} class="space-y-2 flex-1 min-w-0">
      <Input class="w-full" value={summary()} onInput={(e) => setSummary(e.currentTarget.value)}
        aria-label={t("calendar.tasks_edit")} ref={(el) => queueMicrotask(() => el.focus())} />
      <div class="flex flex-wrap gap-2 items-center">
        <Input type="date" class="w-36" value={due()} onInput={(e) => setDue(e.currentTarget.value)}
          aria-label={t("calendar.tasks_due")} />
        <PrioritySelect value={priority()} onChange={setPriority} />
        <Button size="sm" type="submit" disabled={busy()}>{t("calendar.tasks_save")}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={props.onClose}>{t("calendar.tasks_cancel")}</Button>
      </div>
    </form>
  );
}

export default function TasksWidget() {
  const { t, locale } = useI18n();
  const role = useViewerRole();
  const [showDone, setShowDone] = createSignal(false);
  // The source must never be `false`: createQueryResource reads a falsy
  // source as "disabled" and keeps showing the previous data.
  const [tasks, { refetch }] = createQueryResource(
    "tasks",
    () => (role() === "owner" ? (showDone() ? "all" : "open") : null),
    (mode) => fetchTasks(mode === "all"),
  );
  const [cals] = createQueryResource("cdav-calendars", () => role() === "owner" || null, fetchCdavCalendars);

  const [summary, setSummary] = createSignal("");
  const [due, setDue] = createSignal("");
  const [priority, setPriority] = createSignal(0);
  const [target, setTarget] = createSignal("channel");
  const [busy, setBusy] = createSignal(false);
  const [editing, setEditing] = createSignal<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Open before done, then by due date (none last), priority (unset last), newest.
  const sorted = createMemo(() =>
    [...(tasks() ?? [])].sort((a, b) =>
      Number(a.done) - Number(b.done)
      || (a.due ?? "9999").localeCompare(b.due ?? "9999")
      || (a.priority || 10) - (b.priority || 10)
      || b.created.localeCompare(a.created)));

  async function add(e: Event) {
    e.preventDefault();
    if (!summary().trim() || busy()) return;
    setBusy(true);
    try {
      await createTask({
        summary: summary().trim(),
        due: due() || undefined,
        priority: priority() || undefined,
        calendarId: target() === "channel" ? "channel" : Number(target()),
      });
      setSummary(""); setDue(""); setPriority(0);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>) {
    try { await fn(); await refetch(); }
    catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
  }

  const remove = (task: Task) => run(() => {
    const ref = taskRef(task);
    return ref.source === "channel"
      ? deleteEvent(ref.id)
      : deleteEvent(0, { calendarId: ref.calendarId, uri: ref.uri });
  });

  const fmtDue = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "short" });

  return (
    <Show when={role() === "owner"}>
      <Card class="p-4 space-y-3">
        <div class="flex items-center gap-2">
          <h3 class="flex-1 text-xs font-semibold text-muted uppercase tracking-wide">{t("calendar.tasks")}</h3>
          <Button variant="ghost" size="sm" pressed={showDone()} onClick={() => setShowDone((v) => !v)}>
            {t("calendar.tasks_show_done")}
          </Button>
        </div>

        <form onSubmit={add} class="space-y-2">
          <Input
            class="w-full"
            value={summary()}
            onInput={(e) => setSummary(e.currentTarget.value)}
            placeholder={t("calendar.tasks_add")}
            aria-label={t("calendar.tasks_add")}
          />
          <Show when={summary().trim()}>
            <div class="flex flex-wrap gap-2 items-center">
              <Input type="date" class="w-36" value={due()} onInput={(e) => setDue(e.currentTarget.value)}
                aria-label={t("calendar.tasks_due")} />
              <PrioritySelect value={priority()} onChange={setPriority} />
              <Show when={(cals()?.writable_calendars ?? []).length > 0}>
                <Select size="sm" value={target()} onChange={(e) => setTarget(e.currentTarget.value)}
                  aria-label={t("calendar.tasks_list")}>
                  <option value="channel">{t("calendar.tasks_channel")}</option>
                  <For each={cals()!.writable_calendars}>
                    {(c) => <option value={String(c.id)}>{c.displayname}</option>}
                  </For>
                </Select>
              </Show>
              <Button size="sm" type="submit" disabled={busy()}>{t("calendar.tasks_add_btn")}</Button>
            </div>
          </Show>
        </form>

        <Show when={sorted().length} fallback={<p class="text-xs text-muted">{t("calendar.tasks_empty")}</p>}>
          <ul class="space-y-1">
            <For each={sorted()}>
              {(task) => (
                <li class="group flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    class="mt-1 accent-[var(--color-accent)] shrink-0"
                    checked={task.done}
                    disabled={!task.editable}
                    aria-label={task.summary}
                    onChange={() => run(() => toggleTask(task))}
                  />
                  <Show when={editing() === taskKey(task)} fallback={
                  <div class="flex-1 min-w-0">
                    {/* Click the title to edit it (and its due date / priority) */}
                    <button type="button" disabled={!task.editable} onClick={() => setEditing(taskKey(task))}
                      class={`block w-full text-left rounded focus-visible:outline-2 focus-visible:outline-accent ${task.done ? "line-through text-muted" : "text-txt"} ${task.editable ? "hover:text-accent-txt cursor-text" : ""}`}>
                      {task.summary}
                    </button>
                    <p class="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <Show when={task.due}>
                        {(d) => <span classList={{ "text-danger-txt": !task.done && d() < today }}>
                          {t("calendar.tasks_due_on", { date: fmtDue(d()) })}
                        </span>}
                      </Show>
                      <Show when={PRIO(task.priority)}>
                        {(p) => <span classList={{ "text-warning-txt": p() === "high" }}>{t(`calendar.tasks_prio_${p()}` as any)}</span>}
                      </Show>
                      <Show when={task.percent > 0 && task.percent < 100}>
                        <span>{task.percent}%</span>
                      </Show>
                      <Show when={task.source === "caldav" ? task : undefined}>
                        {(c) => <span class="inline-flex items-center gap-1">
                          <span class="w-2 h-2 rounded-full" style={{ background: c().color }} />
                          {c().calendar}
                        </span>}
                      </Show>
                    </p>
                  </div>
                  }>
                    <TaskEditor task={task} onClose={() => setEditing(null)} onSaved={refetch} />
                  </Show>
                  <Show when={task.editable && editing() !== taskKey(task)}>
                    <IconButton label={t("calendar.tasks_delete")} size="sm" variant="danger"
                      class="md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => remove(task)}>
                      <MdOutlineDelete size={14} />
                    </IconButton>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Card>
    </Show>
  );
}
