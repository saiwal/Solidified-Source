// Same layout as the Cards header: title left, Month/Week/Day/List switcher in
// the middle, New event + ⋯ (iCal export/import) on the right.
import { createSignal } from "solid-js";
import { MdOutlineAdd, MdOutlineFile_download, MdOutlineFile_upload } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { toast } from "@utsukta/spa-core/store/toast";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { openEvent } from "@/shared/views/modal-host";
import { importCalendar } from "../api";
import { viewType, setViewType, bumpCalendarRefresh, type ViewType } from "../store";
import { Tabs } from "@ui/Tabs";
import PageActions from "@/shared/views/layout/PageActions";

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

        <PageActions actions={[
          { label: t("calendar.new_event"), icon: MdOutlineAdd, onClick: () => openEvent({ onCreated: bumpCalendarRefresh }), primary: true, show: canCreate() },
          { label: t("calendar.export_ical"), icon: MdOutlineFile_download, href: `/spa/cal/${encodeURIComponent(nick())}?export=ical`, download: `${nick()}-calendar.ics`, overflow: true },
          // Import lands in the viewer's own channel calendar, so only offer it there
          { label: importing() ? t("calendar.importing") : t("calendar.import_ical"), icon: MdOutlineFile_upload, onClick: () => fileInput.click(), disabled: importing(), overflow: true, show: role() === "owner" },
        ]} />
        {/* Outside the actions: it has to outlive the menu/sheet closing while the file picker is open. */}
        <input ref={fileInput} type="file" accept=".ics,.ical,text/calendar" class="hidden" onChange={handleImport} />
      </div>
    </div>
  );
}
