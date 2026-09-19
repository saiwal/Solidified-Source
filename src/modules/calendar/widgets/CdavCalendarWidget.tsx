import { apiError } from "@utsukta/spa-core/lib/fetch";
import {
  createSignal,
  Show,
  For,
  Switch,
  Match,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import {
  fetchCdavCalendars,
  createCdavCalendar,
  toggleCdavCalendar,
  editCdavCalendar,
  deleteCdavCalendar,
  shareCdavCalendar,
  unshareCdavCalendar,
  type CdavCalendar,
  type CdavCalendarsData,
} from "../api/cdav";
import { bumpCalendarRefresh } from "../store";
import { MdOutlineAdd, MdOutlineCalendar_today, MdOutlineDelete, MdOutlineEdit, MdOutlineExpand_more, MdOutlineFile_download, MdOutlineFile_upload } from "solid-icons/md";

// ── small shared primitives ───────────────────────────────────────────────────

const inputCls =
  "bg-overlay border border-rim rounded-lg px-2.5 py-1.5 text-xs text-txt " +
  "placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 w-full";

function ColorDot(props: { color: string }) {
  return (
    <span
      class="w-3 h-3 rounded-full shrink-0 inline-block"
      style={{ background: props.color }}
    />
  );
}

function AccessBadge(props: { access: number }) {
  const { t } = useI18n();
  const rw = () => props.access === 3;
  return (
    <span
      class={`text-[0.5625rem] font-bold px-1 py-0.5 rounded leading-none
        ${rw() ? "bg-accent text-accent-fg" : "bg-elevated text-muted"}`}
    >
      {rw() ? t("calendar.rw_badge") : t("calendar.read_badge")}
    </span>
  );
}

// ── CalendarRow ───────────────────────────────────────────────────────────────

function CalendarRow(props: {
  cal: CdavCalendar;
  localChannels?: { name: string; hash: string }[];
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const cal = () => props.cal;

  const [enabled, setEnabled] = createSignal(cal().enabled);
  const [panel, setPanel] = createSignal<"" | "edit" | "share" | "delete">("");
  const [busy, setBusy] = createSignal(false);

  // Edit form
  const [editName, setEditName] = createSignal(cal().displayname);
  const [editColor, setEditColor] = createSignal(cal().color);

  // Share form
  const [shareHash, setShareHash] = createSignal("");
  const [shareAccess, setShareAccess] = createSignal<2 | 3>(3);

  function togglePanel(name: "edit" | "share" | "delete") {
    setPanel((p) => (p === name ? "" : name));
  }

  async function handleToggle() {
    const next = !enabled();
    setEnabled(next);
    try {
      await toggleCdavCalendar(cal().id, next);
      bumpCalendarRefresh();
    } catch {
      setEnabled(!next);
      toast.error("Failed to toggle calendar");
    }
  }

  async function handleEdit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await editCdavCalendar(
        cal().id as number,
        cal().instanceId!,
        editName(),
        editColor(),
      );
      toast.success("Calendar updated");
      setPanel("");
      props.onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteCdavCalendar(cal().id as number, cal().instanceId!);
      toast.success("Calendar deleted");
      setPanel("");
      props.onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleShare(e: SubmitEvent) {
    e.preventDefault();
    if (!shareHash()) return;
    setBusy(true);
    try {
      await shareCdavCalendar(
        cal().id as number,
        cal().instanceId!,
        shareHash(),
        shareAccess(),
      );
      toast.success("Calendar shared");
      setShareHash("");
      props.onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Share failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnshare(hash: string) {
    try {
      await unshareCdavCalendar(cal().id as number, cal().instanceId!, hash);
      props.onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unshare failed");
    }
  }

  const isOwned = () => typeof cal().id === "number" && cal().editable;

  return (
    <div class="border-b border-rim/60 last:border-none">
      {/* Row */}
      <div class="flex items-center gap-2 py-2 px-1">
        {/* Toggle */}
        <button
          type="button"
          onClick={handleToggle}
          class="shrink-0 text-muted hover:text-txt transition-colors"
          title={enabled() ? "Hide from calendar" : "Show in calendar"}
        >
          <Show
            when={enabled()}
            fallback={
              <MdOutlineCalendar_today class="w-4 h-4" />
            }
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"
              style={{ color: cal().color }}>
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
              <path fill-rule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9 7a1 1 0 10-2 0v3a1 1 0 102 0v-3zm-3-1a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1z"
                clip-rule="evenodd" />
            </svg>
          </Show>
        </button>

        <ColorDot color={cal().color} />

        <span class="flex-1 text-xs text-txt truncate">{cal().displayname}</span>

        <Show when={cal().access}>
          <AccessBadge access={cal().access === "read" ? 2 : 3} />
        </Show>

        {/* Action icons */}
        <div class="flex items-center gap-1 shrink-0">
          {/* Export */}
          <a
            href={cal().exportUrl}
            download=""
            class="p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
            title="Export"
          >
            <MdOutlineFile_download class="w-3.5 h-3.5" />
          </a>

          <Show when={isOwned()}>
            {/* Edit */}
            <button
              type="button"
              onClick={() => togglePanel("edit")}
              class={`p-1 rounded transition-colors
                ${panel() === "edit" ? "text-accent bg-accent-muted" : "text-muted hover:text-txt hover:bg-elevated"}`}
              title="Edit"
            >
              <MdOutlineEdit class="w-3.5 h-3.5" />
            </button>

            {/* Share */}
            <button
              type="button"
              onClick={() => togglePanel("share")}
              class={`p-1 rounded transition-colors
                ${panel() === "share" ? "text-accent bg-accent-muted" : "text-muted hover:text-txt hover:bg-elevated"}`}
              title="Share"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>

            {/* Delete */}
            <button
              type="button"
              onClick={() => togglePanel("delete")}
              class={`p-1 rounded transition-colors
                ${panel() === "delete" ? "text-red-500 bg-red-500/10" : "text-muted hover:text-red-500 hover:bg-elevated"}`}
              title="Delete"
            >
              <MdOutlineDelete class="w-3.5 h-3.5" />
            </button>
          </Show>
        </div>
      </div>

      {/* Sub-panels */}
      <Show when={panel() === "edit"}>
        <form onSubmit={handleEdit} class="mx-2 mb-3 p-3 bg-base rounded-xl border border-rim/60 space-y-2">
          <p class="text-xs font-medium text-muted">{t("calendar.edit_calendar")}</p>
          <input
            type="text"
            value={editName()}
            onInput={(e) => setEditName(e.currentTarget.value)}
            class={inputCls}
            required
          />
          <div class="flex items-center gap-2">
            <input
              type="color"
              value={editColor()}
              onInput={(e) => setEditColor(e.currentTarget.value)}
              class="w-8 h-8 rounded cursor-pointer border border-rim bg-transparent"
            />
            <span class="text-xs text-muted">{t("calendar.calendar_color")}</span>
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" onClick={() => setPanel("")}
              class="px-3 py-1.5 rounded-lg text-xs text-muted hover:bg-elevated transition-colors">
              {t("calendar.cancel")}
            </button>
            <button type="submit" disabled={busy()}
              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40">
              {busy() ? t("calendar.saving") : t("calendar.save")}
            </button>
          </div>
        </form>
      </Show>

      <Show when={panel() === "share"}>
        <div class="mx-2 mb-3 p-3 bg-base rounded-xl border border-rim/60 space-y-2">
          <p class="text-xs font-medium text-muted">{t("calendar.share_calendar")}</p>

          {/* Existing sharees */}
          <Show when={(cal().sharees?.length ?? 0) > 0}>
            <div class="space-y-1">
              <For each={cal().sharees}>
                {(s) => (
                  <div class="flex items-center gap-1.5">
                    <AccessBadge access={s.access} />
                    <span class="text-xs text-txt flex-1 truncate">{s.name}</span>
                    <button
                      type="button"
                      onClick={() => handleUnshare(s.hash)}
                      class="text-xs text-red-500 hover:underline"
                    >
                      {t("calendar.remove_sharee")}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <form onSubmit={handleShare} class="space-y-2">
            <select
              value={shareHash()}
              onChange={(e) => setShareHash(e.currentTarget.value)}
              class={inputCls}
            >
              <option value="">{t("calendar.select_channel")}</option>
              <For each={props.localChannels ?? []}>
                {(ch) => <option value={ch.hash}>{ch.name}</option>}
              </For>
            </select>
            <select
              value={shareAccess()}
              onChange={(e) => setShareAccess(Number(e.currentTarget.value) as 2 | 3)}
              class={inputCls}
            >
              <option value="3">{t("calendar.access_read_write")}</option>
              <option value="2">{t("calendar.access_read_only")}</option>
            </select>
            <div class="flex gap-2 pt-1">
              <button type="button" onClick={() => setPanel("")}
                class="px-3 py-1.5 rounded-lg text-xs text-muted hover:bg-elevated transition-colors">
                {t("calendar.cancel")}
              </button>
              <button type="submit" disabled={busy() || !shareHash()}
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40">
                {busy() ? t("calendar.sharing") : t("calendar.share")}
              </button>
            </div>
          </form>
        </div>
      </Show>

      <Show when={panel() === "delete"}>
        <div class="mx-2 mb-3 p-3 bg-red-500/5 rounded-xl border border-red-500/20 space-y-2">
          <p class="text-xs text-txt">{t("calendar.delete_confirm")}</p>
          <div class="flex gap-2">
            <button type="button" onClick={() => setPanel("")}
              class="px-3 py-1.5 rounded-lg text-xs text-muted hover:bg-elevated transition-colors">
              {t("calendar.cancel")}
            </button>
            <button type="button" onClick={handleDelete} disabled={busy()}
              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:opacity-90 disabled:opacity-40">
              {busy() ? t("calendar.deleting") : t("calendar.delete_calendar")}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section(props: {
  label: string;
  children: any;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  return (
    <div class="border-b border-rim">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        class="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted hover:text-txt hover:bg-elevated/50 transition-colors"
      >
        <span>{props.label}</span>
        <MdOutlineExpand_more class={`w-3.5 h-3.5 transition-transform ${open() ? "rotate-180" : ""}`} />
      </button>
      <Show when={open()}>
        <div class="px-3 pb-2">{props.children}</div>
      </Show>
    </div>
  );
}

// ── ChannelCalendarRow ────────────────────────────────────────────────────────

function ChannelCalendarRow(props: {
  cal: CdavCalendar;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [enabled, setEnabled] = createSignal(props.cal.enabled);

  async function handleToggle() {
    const next = !enabled();
    setEnabled(next);
    try {
      await toggleCdavCalendar("channel_calendar", next);
      bumpCalendarRefresh();
    } catch {
      setEnabled(!next);
    }
  }

  return (
    <div class="flex items-center gap-2 py-2 px-1">
      <button type="button" onClick={handleToggle} class="shrink-0 text-muted hover:text-txt transition-colors">
        <Show
          when={enabled()}
          fallback={
            <MdOutlineCalendar_today class="w-4 h-4" />
          }
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: props.cal.color }}>
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
            <path fill-rule="evenodd"
              d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9 7a1 1 0 10-2 0v3a1 1 0 102 0v-3zm-3-1a1 1 0 011 1v3a1 1 0 11-2 0v-3a1 1 0 011-1z"
              clip-rule="evenodd" />
          </svg>
        </Show>
      </button>
      <ColorDot color={props.cal.color} />
      <span class="flex-1 text-xs text-txt truncate">{props.cal.displayname}</span>
      <a
        href={props.cal.exportUrl}
        download=""
        class="p-1 rounded text-muted hover:text-txt hover:bg-elevated transition-colors"
        title={t("calendar.export_ical") as string}
      >
        <MdOutlineFile_download class="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// ── CreateCalendarForm ────────────────────────────────────────────────────────

function CreateCalendarForm(props: { onCreated: () => void }) {
  const { t } = useI18n();
  const [name, setName] = createSignal("");
  const [color, setColor] = createSignal("#6cad39");
  const [busy, setBusy] = createSignal(false);
  const [open, setOpen] = createSignal(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!name().trim()) return;
    setBusy(true);
    try {
      await createCdavCalendar(name().trim(), color());
      toast.success("Calendar created");
      setName("");
      setColor("#6cad39");
      setOpen(false);
      props.onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        class="w-full flex items-center gap-1.5 px-1 py-1.5 rounded-lg text-xs text-muted hover:text-txt hover:bg-elevated/50 transition-colors"
      >
        <MdOutlineAdd class="w-3.5 h-3.5" />
        {t("calendar.create_calendar")}
      </button>

      <Show when={open()}>
        <form onSubmit={handleSubmit} class="mt-2 p-3 bg-base rounded-xl border border-rim/60 space-y-2">
          <input
            type="text"
            placeholder={t("calendar.calendar_name") as string}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            class={inputCls}
            required
          />
          <div class="flex items-center gap-2">
            <input
              type="color"
              value={color()}
              onInput={(e) => setColor(e.currentTarget.value)}
              class="w-8 h-8 rounded cursor-pointer border border-rim bg-transparent"
            />
            <span class="text-xs text-muted">{t("calendar.calendar_color")}</span>
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)}
              class="px-3 py-1.5 rounded-lg text-xs text-muted hover:bg-elevated transition-colors">
              {t("calendar.cancel")}
            </button>
            <button type="submit" disabled={busy()}
              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40">
              {busy() ? t("calendar.creating_calendar") : t("calendar.create")}
            </button>
          </div>
        </form>
      </Show>
    </div>
  );
}

// ── CdavCalendarWidget (root) ─────────────────────────────────────────────────

export default function CdavCalendarWidget() {
  const { t } = useI18n();

  const [data, { refetch }] = createQueryResource<CdavCalendarsData>("cdav-calendars", fetchCdavCalendars);

  return (
    <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div class="px-4 pt-3.5 pb-3 flex items-center gap-2 shrink-0">
        <MdOutlineCalendar_today class="w-4 h-4 text-muted shrink-0" />
        <h3 class="text-sm font-semibold text-txt flex-1">{t("calendar.calendar_actions")}</h3>
        <Show when={data.loading}>
          <span class="text-xs text-muted">{t("calendar.loading")}</span>
        </Show>
      </div>

      <Switch>
        <Match when={data.error}>
          <div class="px-4 py-4 text-xs text-muted text-center">
            <button onClick={refetch} class="text-accent hover:underline">Retry</button>
          </div>
        </Match>

        <Match when={data()}>
          {(d) => (
            <>
              <Show when={!d().has_cdav}>
                <p class="px-4 py-3 text-xs text-muted">{t("calendar.no_cdav")}</p>
              </Show>

              {/* Channel calendar */}
              <Section label={t("calendar.channel_calendar") as string} defaultOpen>
                <ChannelCalendarRow
                  cal={d().channel_calendar}
                  onRefresh={refetch}
                />
              </Section>

              {/* My CalDAV calendars */}
              <Show when={d().has_cdav}>
                <Section label={t("calendar.my_calendars") as string} defaultOpen>
                  <Show
                    when={d().my_calendars.length > 0}
                    fallback={<p class="py-1 text-xs text-muted">{t("calendar.no_events")}</p>}
                  >
                    <For each={d().my_calendars}>
                      {(cal) => (
                        <CalendarRow
                          cal={cal}
                          localChannels={d().local_channels}
                          onRefresh={refetch}
                        />
                      )}
                    </For>
                  </Show>
                </Section>

                {/* Shared calendars */}
                <Show when={d().shared_calendars.length > 0}>
                  <Section label={t("calendar.shared_calendars") as string} defaultOpen>
                    <For each={d().shared_calendars}>
                      {(cal) => (
                        <CalendarRow
                          cal={cal}
                          onRefresh={refetch}
                        />
                      )}
                    </For>
                  </Section>
                </Show>

                {/* Tools: create + import */}
                <Section label={t("calendar.calendar_tools") as string} defaultOpen={false}>
                  <CreateCalendarForm onCreated={refetch} />
                  <ImportSection writable={d().writable_calendars} channelCal={d().channel_calendar} onImported={refetch} />
                </Section>
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}

// ── ImportSection ─────────────────────────────────────────────────────────────

function ImportSection(props: {
  writable: { id: number; instanceId: number; displayname: string }[];
  channelCal: CdavCalendar;
  onImported: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);
  const [target, setTarget] = createSignal("channel_calendar");
  const [importing, setImporting] = createSignal(false);

  async function handleFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const { getCsrfToken } = await import("@utsukta/spa-core/lib/csrf");
      const { importCalendar } = await import("../api");

      if (target() === "channel_calendar") {
        const result = await importCalendar(text);
        toast.success(`${t("calendar.import_success")} (${result.imported})`);
      } else {
        // Import to specific CalDAV calendar via cdav module (Hubzilla handles this)
        const targetId = target();
        const token = await getCsrfToken();
        const fd = new FormData();
        fd.append("userfile", file);
        fd.append("target", targetId);
        fd.append("c_upload", "c_upload");
        const res = await fetch("/cdav/calendar", {
          method: "POST",
          credentials: "include",
          headers: { "X-CSRF-Token": token },
          body: fd,
        });
        if (!res.ok) throw await apiError(res);
        toast.success(t("calendar.import_success") as string);
      }

      props.onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("calendar.import_failed") as string);
    } finally {
      setImporting(false);
      input.value = "";
    }
  }

  return (
    <div class="py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        class="w-full flex items-center gap-1.5 px-1 py-1.5 rounded-lg text-xs text-muted hover:text-txt hover:bg-elevated/50 transition-colors"
      >
        <MdOutlineFile_upload class="w-3.5 h-3.5" />
        {t("calendar.import_ical")}
      </button>

      <Show when={open()}>
        <div class="mt-2 p-3 bg-base rounded-xl border border-rim/60 space-y-2">
          <select
            value={target()}
            onChange={(e) => setTarget(e.currentTarget.value)}
            class={inputCls}
          >
            <option value="channel_calendar">{props.channelCal.displayname}</option>
            <For each={props.writable}>
              {(cal) => (
                <option value={`${cal.id}:${cal.instanceId}`}>{cal.displayname}</option>
              )}
            </For>
          </select>
          <label
            class={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border border-rim
                    text-muted hover:bg-elevated cursor-pointer transition-colors
                    ${importing() ? "opacity-60 pointer-events-none" : ""}`}
          >
            <MdOutlineFile_upload class="w-3.5 h-3.5" />
            {importing() ? t("calendar.importing") : t("calendar.import_ical")}
            <input
              type="file"
              accept=".ics,.ical,text/calendar"
              class="hidden"
              onChange={handleFile}
              disabled={importing()}
            />
          </label>
        </div>
      </Show>
    </div>
  );
}
