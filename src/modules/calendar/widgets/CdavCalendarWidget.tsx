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
import { Modal, modalPanelClass } from "@ui/Modal";
import { SkeletonRows } from "@/shared/views/ui";
import { Motion, pop } from "@/shared/views/anim";
import {
  MdOutlineAdd, MdOutlineCalendar_today, MdOutlineDelete, MdOutlineEdit, MdOutlineExpand_more,
  MdOutlineFile_download, MdOutlineFile_upload, MdOutlineMore_horiz, MdOutlineShare,
} from "solid-icons/md";
import { Button, IconButton, iconButtonClass, primaryPill } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { ColorSwatch } from "@ui/ColorSwatch";
import { Card } from "@ui/Card";
import { Menu, MenuItem, MenuSeparator } from "@ui/Menu";

// ── small shared primitives ───────────────────────────────────────────────────


function Dialog(props: { title: string; onClose: () => void; children: JSX.Element }) {
  const id = createUniqueId();
  return (
    <Modal onClose={props.onClose} labelledBy={id}>
      <Motion.div {...pop} class={`${modalPanelClass("sm")} p-6 space-y-5`}>
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
      <Button variant="ghost" onClick={props.onCancel}>{t("calendar.cancel")}</Button>
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
        <Input
          class="w-full"
          type="text"
          required
          autofocus
          placeholder={t("calendar.calendar_name")}
          aria-label={t("calendar.calendar_name")}
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <ColorSwatch value={color()} onChange={setColor} label={t("calendar.calendar_color")} />
        <DialogActions onCancel={props.onClose}>
          <Button type="submit" disabled={busy()}>{busy() ? props.busyLabel : props.submitLabel}</Button>
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

  // Share form
  const [shareHash, setShareHash] = createSignal("");
  const [shareAccess, setShareAccess] = createSignal<2 | 3>(3);

  const pick = (name: "edit" | "share" | "delete") => setDialog(name);

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

      <Menu
        label={t("calendar.more")}
        trigger={(p, open) => (
          <IconButton
            label={t("calendar.more")}
            size="sm"
            class={`md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 ${open() ? "md:opacity-100" : ""}`}
            {...p}
          >
            <MdOutlineMore_horiz size={16} />
          </IconButton>
        )}
      >
        <MenuItem icon={<MdOutlineFile_download size={16} />} href={cal().exportUrl} download="">
          {t("calendar.export")}
        </MenuItem>
        <Show when={isOwned()}>
          <MenuItem icon={<MdOutlineEdit size={16} />} onClick={() => pick("edit")}>{t("calendar.edit")}</MenuItem>
          <MenuItem icon={<MdOutlineShare size={16} />} onClick={() => pick("share")}>{t("calendar.share")}</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<MdOutlineDelete size={16} />} danger onClick={() => pick("delete")}>
            {t("calendar.delete_calendar")}
          </MenuItem>
        </Show>
      </Menu>
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
                      class="text-xs text-muted hover:text-danger-txt transition-colors">
                      {t("calendar.remove_sharee")}
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <form onSubmit={handleShare} class="space-y-5">
            <Select
              class="w-full"
              value={shareHash()}
              onChange={(e) => setShareHash(e.currentTarget.value)}
              aria-label={t("calendar.select_channel")}
            >
              <option value="">{t("calendar.select_channel")}</option>
              <For each={props.localChannels ?? []}>
                {(ch) => <option value={ch.hash}>{ch.name}</option>}
              </For>
            </Select>
            <Select
              class="w-full"
              value={shareAccess()}
              onChange={(e) => setShareAccess(Number(e.currentTarget.value) as 2 | 3)}
            >
              <option value="3">{t("calendar.access_read_write")}</option>
              <option value="2">{t("calendar.access_read_only")}</option>
            </Select>
            <DialogActions onCancel={() => setDialog("")}>
              <Button type="submit" disabled={busy() || !shareHash()}>
                {busy() ? t("calendar.sharing") : t("calendar.share")}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </Show>

      <Show when={dialog() === "delete"}>
        <Dialog title={t("calendar.delete_calendar")} onClose={() => setDialog("")}>
          <p class="text-sm text-muted">{t("calendar.delete_confirm")}</p>
          <DialogActions onCancel={() => setDialog("")}>
            <Button variant="danger" onClick={handleDelete} disabled={busy()}>
              {busy() ? t("calendar.deleting") : t("calendar.delete_calendar")}
            </Button>
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
        class={`${iconButtonClass("default", "sm")} md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100`}
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
      <Select
        class="w-full"
        value={target()}
        onChange={(e) => setTarget(e.currentTarget.value)}
        aria-label={t("calendar.calendar_label")}
      >
        <option value="channel_calendar">{props.channelCal.displayname}</option>
        <For each={props.writable}>
          {(cal) => <option value={`${cal.id}:${cal.instanceId}`}>{cal.displayname}</option>}
        </For>
      </Select>
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
    <Card raised class="overflow-hidden pb-2">
      {/* Header */}
      <div class="pl-4 pr-2 pt-3 flex items-center gap-2">
        <MdOutlineCalendar_today class="w-4 h-4 text-muted shrink-0" />
        <h3 class="text-sm font-semibold text-txt flex-1">{t("calendar.calendar_actions")}</h3>
        <Show when={data()?.has_cdav}>
          <IconButton label={t("calendar.import_ical")} size="sm" onClick={() => setDialog("import")}>
            <MdOutlineFile_upload size={16} />
          </IconButton>
          <IconButton label={t("calendar.create_calendar")} size="sm" onClick={() => setDialog("create")}>
            <MdOutlineAdd size={16} />
          </IconButton>
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
    </Card>
  );
}
