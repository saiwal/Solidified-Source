import { apiError } from "@utsukta/spa-core/lib/fetch";
import {
  createSignal,
  createUniqueId,
  Show,
  For,
  Switch,
  Match,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
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
import Modal from "@/shared/views/Modal";
import { createPopover } from "@/shared/stream/filters/createPopover";
import { primaryPill, ghostPill, SkeletonRows } from "@/shared/views/ui";
import { Motion, pop } from "@/shared/views/anim";
import {
  MdOutlineAdd, MdOutlineCalendar_today, MdOutlineDelete, MdOutlineEdit, MdOutlineExpand_more,
  MdOutlineFile_download, MdOutlineFile_upload, MdOutlineMore_horiz, MdOutlineShare,
} from "solid-icons/md";

// ── small shared primitives ───────────────────────────────────────────────────

const fieldCls =
  "w-full bg-transparent border-0 border-b border-rim px-0 py-1.5 text-sm text-txt " +
  "placeholder:text-muted focus:outline-none focus:border-accent transition-colors";
const dangerPill =
  "inline-flex items-center gap-2 h-10 px-5 rounded-full bg-red-500 text-white text-sm font-medium " +
  "hover:brightness-110 transition disabled:opacity-60";
const menuPanel = "z-50 rounded-2xl bg-surface/95 backdrop-blur-xl shadow-2xl ring-1 ring-rim/60 p-2 w-48";
const menuItem = "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-txt hover:bg-elevated/70 text-left";
const smallIconBtn = "p-1.5 rounded-full text-muted hover:text-txt hover:bg-elevated/70 transition-colors";

function Dialog(props: { title: string; onClose: () => void; children: JSX.Element }) {
  const id = createUniqueId();
  return (
    <Modal onClose={props.onClose} labelledBy={id}>
      <Motion.div {...pop} class="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-2xl space-y-5">
        <h2 id={id} class="text-lg font-semibold text-txt">{props.title}</h2>
        {props.children}
      </Motion.div>
    </Modal>
  );
}

function DialogActions(props: { onCancel: () => void; children: JSX.Element }) {
  const { t } = useI18n();
  return (
    <div class="flex justify-end gap-2 pt-1">
      <button type="button" onClick={props.onCancel} class={ghostPill}>{t("calendar.cancel")}</button>
      {props.children}
    </div>
  );
}

/** The colour dot doubles as the show/hide toggle: filled when shown, a ring when hidden. */
function ToggleDot(props: { color: string; enabled: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const label = () => (props.enabled ? t("calendar.hide_calendar") : t("calendar.show_calendar"));
  return (
    <button type="button" onClick={props.onToggle} aria-pressed={props.enabled} title={label()} aria-label={label()}
      class="shrink-0 p-1 -m-1 rounded-full focus-visible:outline-2 focus-visible:outline-accent">
      <span class="block w-3 h-3 rounded-full transition-colors"
        style={props.enabled
          ? { background: props.color }
          : { "box-shadow": `inset 0 0 0 1.5px ${props.color}` }} />
    </button>
  );
}

/** Name + colour form, used both to create a calendar and to edit one. */
function CalendarForm(props: {
  title: string; name?: string; color?: string; submitLabel: string; busyLabel: string;
  onClose: () => void; onSubmit: (name: string, color: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = createSignal(props.name ?? "");
  const [color, setColor] = createSignal(props.color ?? "#6cad39");
  const [busy, setBusy] = createSignal(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!name().trim()) return;
    setBusy(true);
    try {
      await props.onSubmit(name().trim(), color());
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <form onSubmit={submit} class="space-y-5">
        <input type="text" required autofocus placeholder={t("calendar.calendar_name")} aria-label={t("calendar.calendar_name")}
          value={name()} onInput={(e) => setName(e.currentTarget.value)} class={fieldCls} />
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="color" value={color()} onInput={(e) => setColor(e.currentTarget.value)}
            class="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent p-0" />
          <span class="text-sm text-muted">{t("calendar.calendar_color")}</span>
        </label>
        <DialogActions onCancel={props.onClose}>
          <button type="submit" disabled={busy()} class={primaryPill}>{busy() ? props.busyLabel : props.submitLabel}</button>
        </DialogActions>
      </form>
    </Dialog>
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
  const [dialog, setDialog] = createSignal<"" | "edit" | "share" | "delete">("");
  const [busy, setBusy] = createSignal(false);
  const menu = createPopover({ placement: "bottom-end" });

  // Share form
  const [shareHash, setShareHash] = createSignal("");
  const [shareAccess, setShareAccess] = createSignal<2 | 3>(3);

  function pick(name: "edit" | "share" | "delete") {
    menu.setOpen(false);
    setDialog(name);
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

  async function handleDelete() {
    setBusy(true);
    try {
      await deleteCdavCalendar(cal().id as number, cal().instanceId!);
      toast.success("Calendar deleted");
      setDialog("");
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
      await shareCdavCalendar(cal().id as number, cal().instanceId!, shareHash(), shareAccess());
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
  const accessLabel = (rw: boolean) => (rw ? t("calendar.access_read_write") : t("calendar.access_read_only"));

  return (
    <div class="group flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-elevated/40 transition-colors">
      <ToggleDot color={cal().color} enabled={enabled()} onToggle={handleToggle} />
      <span class={`flex-1 text-sm truncate ${enabled() ? "text-txt" : "text-muted"}`}>{cal().displayname}</span>
      <Show when={cal().access}>
        <span class="text-[0.625rem] text-muted shrink-0">{accessLabel(cal().access !== "read")}</span>
      </Show>

      <span ref={menu.ref}>
        <button type="button" class={`${smallIconBtn} md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 ${menu.open() ? "md:opacity-100" : ""}`}
          title={t("calendar.more")} aria-label={t("calendar.more")} aria-expanded={menu.open()}
          onClick={() => menu.setOpen(!menu.open())}>
          <MdOutlineMore_horiz size={16} />
        </button>
      </span>

      <Show when={menu.open()}>
        <Portal mount={topLayer()}>
          <div ref={menu.floating} style={menu.style()} class={menuPanel}>
            <a href={cal().exportUrl} download="" class={menuItem} onClick={() => menu.setOpen(false)}>
              <MdOutlineFile_download size={16} class="text-muted shrink-0" /> {t("calendar.export")}
            </a>
            <Show when={isOwned()}>
              <button type="button" class={menuItem} onClick={() => pick("edit")}>
                <MdOutlineEdit size={16} class="text-muted shrink-0" /> {t("calendar.edit")}
              </button>
              <button type="button" class={menuItem} onClick={() => pick("share")}>
                <MdOutlineShare size={16} class="text-muted shrink-0" /> {t("calendar.share")}
              </button>
              <div class="my-1.5 h-px bg-rim/60" />
              <button type="button" class={`${menuItem} hover:text-red-500`} onClick={() => pick("delete")}>
                <MdOutlineDelete size={16} class="shrink-0" /> {t("calendar.delete_calendar")}
              </button>
            </Show>
          </div>
        </Portal>
      </Show>

      <Show when={dialog() === "edit"}>
        <CalendarForm
          title={t("calendar.edit_calendar")} name={cal().displayname} color={cal().color}
          submitLabel={t("calendar.save")} busyLabel={t("calendar.saving")}
          onClose={() => setDialog("")}
          onSubmit={async (name, color) => {
            await editCdavCalendar(cal().id as number, cal().instanceId!, name, color);
            toast.success("Calendar updated");
            props.onRefresh();
          }}
        />
      </Show>

      <Show when={dialog() === "share"}>
        <Dialog title={t("calendar.share_calendar")} onClose={() => setDialog("")}>
          {/* Existing sharees */}
          <Show when={(cal().sharees?.length ?? 0) > 0}>
            <div class="space-y-0.5 -mx-2">
              <For each={cal().sharees}>
                {(s) => (
                  <div class="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-elevated/40">
                    <span class="text-sm text-txt flex-1 truncate">{s.name}</span>
                    <span class="text-xs text-muted">{accessLabel(s.access === 3)}</span>
                    <button type="button" onClick={() => handleUnshare(s.hash)}
                      class="text-xs text-muted hover:text-red-500 transition-colors">
                      {t("calendar.remove_sharee")}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <form onSubmit={handleShare} class="space-y-5">
            <select value={shareHash()} onChange={(e) => setShareHash(e.currentTarget.value)} class={fieldCls}
              aria-label={t("calendar.select_channel")}>
              <option value="">{t("calendar.select_channel")}</option>
              <For each={props.localChannels ?? []}>
                {(ch) => <option value={ch.hash}>{ch.name}</option>}
              </For>
            </select>
            <select value={shareAccess()} onChange={(e) => setShareAccess(Number(e.currentTarget.value) as 2 | 3)} class={fieldCls}>
              <option value="3">{t("calendar.access_read_write")}</option>
              <option value="2">{t("calendar.access_read_only")}</option>
            </select>
            <DialogActions onCancel={() => setDialog("")}>
              <button type="submit" disabled={busy() || !shareHash()} class={primaryPill}>
                {busy() ? t("calendar.sharing") : t("calendar.share")}
              </button>
            </DialogActions>
          </form>
        </Dialog>
      </Show>

      <Show when={dialog() === "delete"}>
        <Dialog title={t("calendar.delete_calendar")} onClose={() => setDialog("")}>
          <p class="text-sm text-muted">{t("calendar.delete_confirm")}</p>
          <DialogActions onCancel={() => setDialog("")}>
            <button type="button" onClick={handleDelete} disabled={busy()} class={dangerPill}>
              {busy() ? t("calendar.deleting") : t("calendar.delete_calendar")}
            </button>
          </DialogActions>
        </Dialog>
      </Show>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section(props: { label: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(true);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open()}
        onClick={() => setOpen((o) => !o)}
        class="w-full flex items-center justify-between px-4 pt-3 pb-1 text-xs font-semibold text-muted hover:text-txt transition-colors"
      >
        <span>{props.label}</span>
        <MdOutlineExpand_more class={`w-3.5 h-3.5 transition-transform ${open() ? "rotate-180" : ""}`} />
      </button>
      <Show when={open()}>
        <div class="px-2">{props.children}</div>
      </Show>
    </div>
  );
}

// ── ChannelCalendarRow ────────────────────────────────────────────────────────

function ChannelCalendarRow(props: { cal: CdavCalendar }) {
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
    <div class="group flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-elevated/40 transition-colors">
      <ToggleDot color={props.cal.color} enabled={enabled()} onToggle={handleToggle} />
      <span class={`flex-1 text-sm truncate ${enabled() ? "text-txt" : "text-muted"}`}>{props.cal.displayname}</span>
      <a
        href={props.cal.exportUrl}
        download=""
        class={`${smallIconBtn} md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100`}
        title={t("calendar.export_ical")}
        aria-label={t("calendar.export_ical")}
      >
        <MdOutlineFile_download size={16} />
      </a>
    </div>
  );
}

// ── ImportDialog ──────────────────────────────────────────────────────────────

function ImportDialog(props: {
  writable: { id: number; instanceId: number; displayname: string }[];
  channelCal: CdavCalendar;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useI18n();
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
        const token = await getCsrfToken();
        const fd = new FormData();
        fd.append("userfile", file);
        fd.append("target", target());
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
      bumpCalendarRefresh();
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("calendar.import_failed") as string);
    } finally {
      setImporting(false);
      input.value = "";
    }
  }

  return (
    <Dialog title={t("calendar.import_ical")} onClose={props.onClose}>
      <select value={target()} onChange={(e) => setTarget(e.currentTarget.value)} class={fieldCls}
        aria-label={t("calendar.calendar_label")}>
        <option value="channel_calendar">{props.channelCal.displayname}</option>
        <For each={props.writable}>
          {(cal) => <option value={`${cal.id}:${cal.instanceId}`}>{cal.displayname}</option>}
        </For>
      </select>
      <DialogActions onCancel={props.onClose}>
        <label class={`${primaryPill} cursor-pointer ${importing() ? "opacity-60 pointer-events-none" : ""}`}>
          <MdOutlineFile_upload size={18} />
          {importing() ? t("calendar.importing") : t("calendar.import_ical")}
          <input type="file" accept=".ics,.ical,text/calendar" class="hidden" onChange={handleFile} disabled={importing()} />
        </label>
      </DialogActions>
    </Dialog>
  );
}

// ── CdavCalendarWidget (root) ─────────────────────────────────────────────────

export default function CdavCalendarWidget() {
  const { t } = useI18n();
  const [dialog, setDialog] = createSignal<"" | "create" | "import">("");

  const [data, { refetch }] = createQueryResource<CdavCalendarsData>("cdav-calendars", fetchCdavCalendars);

  return (
    <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden pb-2">
      {/* Header */}
      <div class="pl-4 pr-2 pt-3 flex items-center gap-2">
        <MdOutlineCalendar_today class="w-4 h-4 text-muted shrink-0" />
        <h3 class="text-sm font-semibold text-txt flex-1">{t("calendar.calendar_actions")}</h3>
        <Show when={data()?.has_cdav}>
          <button type="button" class={smallIconBtn} onClick={() => setDialog("import")}
            title={t("calendar.import_ical")} aria-label={t("calendar.import_ical")}>
            <MdOutlineFile_upload size={16} />
          </button>
          <button type="button" class={smallIconBtn} onClick={() => setDialog("create")}
            title={t("calendar.create_calendar")} aria-label={t("calendar.create_calendar")}>
            <MdOutlineAdd size={16} />
          </button>
        </Show>
      </div>

      <Switch>
        <Match when={data.error}>
          <div class="px-4 py-4 text-sm text-muted text-center">
            <button type="button" onClick={refetch} class="text-accent-txt hover:underline">{t("calendar.retry")}</button>
          </div>
        </Match>

        <Match when={data.loading && !data()}>
          <SkeletonRows count={3} />
        </Match>

        <Match when={data()}>
          {(d) => (
            <>
              <Show when={!d().has_cdav}>
                <p class="px-4 pt-2 text-xs text-muted">{t("calendar.no_cdav")}</p>
              </Show>

              <Section label={t("calendar.channel_calendar")}>
                <ChannelCalendarRow cal={d().channel_calendar} />
              </Section>

              <Show when={d().has_cdav}>
                <Section label={t("calendar.my_calendars")}>
                  <For each={d().my_calendars}>
                    {(cal) => <CalendarRow cal={cal} localChannels={d().local_channels} onRefresh={refetch} />}
                  </For>
                </Section>

                <Show when={d().shared_calendars.length > 0}>
                  <Section label={t("calendar.shared_calendars")}>
                    <For each={d().shared_calendars}>
                      {(cal) => <CalendarRow cal={cal} onRefresh={refetch} />}
                    </For>
                  </Section>
                </Show>
              </Show>

              <Show when={dialog() === "import"}>
                <ImportDialog writable={d().writable_calendars} channelCal={d().channel_calendar}
                  onClose={() => setDialog("")} onImported={refetch} />
              </Show>
            </>
          )}
        </Match>
      </Switch>

      <Show when={dialog() === "create"}>
        <CalendarForm
          title={t("calendar.create_calendar")}
          submitLabel={t("calendar.create")} busyLabel={t("calendar.creating_calendar")}
          onClose={() => setDialog("")}
          onSubmit={async (name, color) => {
            await createCdavCalendar(name, color);
            toast.success("Calendar created");
            refetch();
          }}
        />
      </Show>
    </div>
  );
}
