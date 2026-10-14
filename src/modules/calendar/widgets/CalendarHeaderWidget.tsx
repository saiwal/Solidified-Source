// Same layout as the Cards header: title left, Month/Week/Day/List switcher in
// the middle, New event + ⋯ (iCal export/import) on the right.
import { createSignal, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { MdOutlineAdd, MdOutlineMore_horiz, MdOutlineFile_download, MdOutlineFile_upload } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { toast } from "@utsukta/spa-core/store/toast";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { createPopover } from "@/shared/stream/filters/createPopover";
import { openEvent } from "@/shared/views/modal-host";
import { importCalendar } from "../api";
import { viewType, setViewType, bumpCalendarRefresh, type ViewType } from "../store";

const VIEWS: ViewType[] = ["month", "week", "day", "list"];
const VIEW_LABEL = {
  month: "calendar.view_month", week: "calendar.view_week", day: "calendar.view_day", list: "calendar.view_list",
} as const;

const squareBtn = "p-1.5 rounded-lg border border-rim bg-surface text-muted hover:bg-elevated hover:text-txt transition-colors";
const panel = "z-50 rounded-2xl bg-surface/95 backdrop-blur-xl shadow-2xl ring-1 ring-rim/60 p-2";
const menuItem = "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-txt hover:bg-elevated/70 text-left cursor-pointer";

export default function CalendarHeaderWidget() {
  const { t } = useI18n();
  const owner = usePageOwnerName();
  const auth = useAuth();
  const role = useViewerRole();
  const nick = usePageNick();
  // New events always go to the viewer's own calendar — creation requires a
  // local channel on this server, regardless of whose /cal page is open.
  const canCreate = () => auth()?.isLocal === true;
  const more = createPopover({ placement: "bottom-end" });
  const [importing, setImporting] = createSignal(false);

  async function handleImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    more.setOpen(false);
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

        <div class="flex gap-1 p-1 bg-elevated rounded-lg w-fit mx-auto">
          <For each={VIEWS}>
            {(v) => (
              <button
                type="button"
                aria-pressed={viewType() === v}
                onClick={() => setViewType(v)}
                class={`px-3 text-center text-xs py-1 rounded-md transition-colors font-medium
                  ${viewType() === v ? "bg-accent text-accent-fg font-semibold" : "text-muted hover:text-txt"}`}
              >
                {t(VIEW_LABEL[v])}
              </button>
            )}
          </For>
        </div>

        <div class="flex items-center gap-1.5">
          <Show when={canCreate()}>
            <button
              type="button"
              onClick={() => openEvent({ onCreated: bumpCalendarRefresh })}
              class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-accent text-accent-fg hover:opacity-90 transition-opacity"
            >
              <MdOutlineAdd class="w-4 h-4" />
              {t("calendar.new_event")}
            </button>
          </Show>

          <span ref={more.ref}>
            <button type="button" class={squareBtn} title={t("calendar.more")} aria-label={t("calendar.more")}
              aria-expanded={more.open()} onClick={() => more.setOpen(!more.open())}>
              <MdOutlineMore_horiz size={15} />
            </button>
          </span>
        </div>
      </div>

      <Show when={more.open()}>
        <Portal mount={topLayer()}>
          <div ref={more.floating} style={more.style()} class={`${panel} w-60`}>
            <a href={`/spa/cal/${encodeURIComponent(nick())}?export=ical`} download={`${nick()}-calendar.ics`}
              class={menuItem} onClick={() => more.setOpen(false)}>
              <span class="w-4 shrink-0 text-muted"><MdOutlineFile_download size={16} /></span>
              {t("calendar.export_ical")}
            </a>
            {/* Import lands in the viewer's own channel calendar, so only offer it there */}
            <Show when={role() === "owner"}>
              <label class={`${menuItem} ${importing() ? "opacity-60 pointer-events-none" : ""}`}>
                <span class="w-4 shrink-0 text-muted"><MdOutlineFile_upload size={16} /></span>
                {importing() ? t("calendar.importing") : t("calendar.import_ical")}
                <input type="file" accept=".ics,.ical,text/calendar" class="hidden" onChange={handleImport} disabled={importing()} />
              </label>
            </Show>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
