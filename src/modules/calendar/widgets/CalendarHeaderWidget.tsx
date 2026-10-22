// Same layout as the Cards header: title left, Month/Week/Day/List switcher in
// the middle, New event + ⋯ (iCal export/import) on the right.
import { createSignal, Show } from "solid-js";
import { MdOutlineAdd, MdOutlineMore_horiz, MdOutlineFile_download, MdOutlineFile_upload } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { toast } from "@utsukta/spa-core/store/toast";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { openEvent } from "@/shared/views/modal-host";
import { importCalendar } from "../api";
import { viewType, setViewType, bumpCalendarRefresh, type ViewType } from "../store";
import { Button, IconButton } from "@ui/Button";
import { Menu, MenuItem } from "@ui/Menu";
import { Tabs } from "@ui/Tabs";

const VIEWS: ViewType[] = ["month", "week", "day", "list"];
const VIEW_LABEL = {
  month: "calendar.view_month", week: "calendar.view_week", day: "calendar.view_day", list: "calendar.view_list",
} as const;


export default function CalendarHeaderWidget() {
  const { t } = useI18n();
  const owner = usePageOwnerName();
  const role = useViewerRole();
  const nick = usePageNick();
  // New events always go to the viewer's own calendar — creation requires a
  // local channel on this server, regardless of whose /cal page is open.
  // New events land in the viewer's own calendar, so offer it only there.
  const canCreate = () => role() === "owner";
  let fileInput!: HTMLInputElement;
  const [importing, setImporting] = createSignal(false);

  async function handleImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importCalendar(await file.text());
      toast.success(`${t("calendar.import_success")} (${result.imported})`);
      bumpCalendarRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("calendar.import_failed"));
    } finally {
      setImporting(false);
      input.value = "";
    }
  }

  return (
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h1 class="text-xl font-bold text-txt">
          {owner() === null ? t("calendar.title_mine") : t("calendar.title_of", { name: owner()! })}
        </h1>

        <Tabs
          label={t("nav.calendar")}
          class="mx-auto"
          value={viewType()}
          onChange={setViewType}
          items={VIEWS.map((v) => ({ value: v, label: t(VIEW_LABEL[v]) }))}
        />

        <div class="flex items-center gap-1.5">
          <Show when={canCreate()}>
            <Button size="sm" onClick={() => openEvent({ onCreated: bumpCalendarRefresh })}>
              <MdOutlineAdd class="w-4 h-4" />
              {t("calendar.new_event")}
            </Button>
          </Show>

          <Menu
            label={t("calendar.more")}
            class="w-60"
            trigger={(p) => (
              <IconButton label={t("calendar.more")} variant="outline" {...p}>
                <MdOutlineMore_horiz size={15} />
              </IconButton>
            )}
          >
            <MenuItem
              icon={<MdOutlineFile_download size={16} />}
              href={`/spa/cal/${encodeURIComponent(nick())}?export=ical`}
              download={`${nick()}-calendar.ics`}
            >
              {t("calendar.export_ical")}
            </MenuItem>
            {/* Import lands in the viewer's own channel calendar, so only offer it there */}
            <Show when={role() === "owner"}>
              <MenuItem icon={<MdOutlineFile_upload size={16} />} disabled={importing()} onClick={() => fileInput.click()}>
                {importing() ? t("calendar.importing") : t("calendar.import_ical")}
              </MenuItem>
            </Show>
          </Menu>
          {/* Outside the menu: it has to outlive the menu closing while the file picker is open. */}
          <input ref={fileInput} type="file" accept=".ics,.ical,text/calendar" class="hidden" onChange={handleImport} />
        </div>
      </div>
    </div>
  );
}
