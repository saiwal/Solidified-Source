import { createSignal, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import EventCreatorModal from "./EventCreatorModal";
import { importCalendar } from "../api";
import { nick as calNick, range as calRange, loadCalendar, monthRange } from "../store";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { MdOutlineAdd, MdOutlineCalendar_today, MdOutlineFile_download, MdOutlineFile_upload } from "solid-icons/md";

export default function CalendarActionsWidget() {
  const { t } = useI18n();
  const pageNick = usePageNick();
  const [showCreator, setShowCreator] = createSignal(false);
  const [importing, setImporting] = createSignal(false);

  function getNick() {
    return calNick() || pageNick();
  }

  function handleExport() {
    const nick = getNick();
    if (!nick) return;
    const a = document.createElement("a");
    a.href = `/spa/cal/${encodeURIComponent(nick)}?export=ical`;
    a.download = `${nick}-calendar.ics`;
    a.click();
  }

  async function handleImport(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const result = await importCalendar(text);
      toast.success(`${t("calendar.import_success")} (${result.imported} events)`);
      // Force-refresh the visible calendar
      const nick = getNick();
      if (nick) {
        const r = calRange();
        if (r) {
          loadCalendar(nick, r, true);
        } else {
          const d = new Date();
          loadCalendar(nick, monthRange(d.getFullYear(), d.getMonth() + 1), true);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("calendar.import_failed"));
    } finally {
      setImporting(false);
      input.value = "";
    }
  }

  function handleCreated() {
    setShowCreator(false);
    const nick = getNick();
    if (nick) {
      const r = calRange();
      if (r) {
        loadCalendar(nick, r, true);
      } else {
        const d = new Date();
        loadCalendar(nick, monthRange(d.getFullYear(), d.getMonth() + 1), true);
      }
    }
  }

  return (
    <>
      <div class="bg-surface border border-rim rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {/* Header */}
        <div class="px-4 pt-3.5 pb-3 shrink-0 flex items-center gap-2">
          <MdOutlineCalendar_today class="w-4 h-4 text-muted shrink-0" />
          <h3 class="text-sm font-semibold text-txt">{t("calendar.calendar_actions")}</h3>
        </div>

        <div class="p-3 flex flex-col gap-2">
          {/* New Event */}
          <button
            type="button"
            onClick={() => setShowCreator(true)}
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                   bg-accent text-accent-fg hover:opacity-90 transition-opacity"
          >
            <MdOutlineAdd class="w-4 h-4 shrink-0" />
            {t("calendar.new_event")}
          </button>

          {/* Export */}
          <button
            type="button"
            onClick={handleExport}
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                   border border-rim text-txt hover:bg-elevated transition-colors"
          >
            <MdOutlineFile_download class="w-4 h-4 shrink-0" />
            {t("calendar.export_ical")}
          </button>

          {/* Import */}
          <label
            class={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                   border border-rim text-txt hover:bg-elevated transition-colors cursor-pointer
                   ${importing() ? "opacity-60 pointer-events-none" : ""}`}
          >
            <MdOutlineFile_upload class="w-4 h-4 shrink-0" />
            {importing() ? t("calendar.importing") : t("calendar.import_ical")}
            <input
              type="file"
              accept=".ics,.ical,text/calendar"
              class="hidden"
              onChange={handleImport}
              disabled={importing()}
            />
          </label>
        </div>
      </div>

      <Show when={showCreator()}>
        <EventCreatorModal
          onClose={() => setShowCreator(false)}
          onCreated={handleCreated}
        />
      </Show>
    </>
  );
}
