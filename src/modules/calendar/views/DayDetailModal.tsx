import { createSignal, Show, For, createUniqueId } from "solid-js";
import {
  MdFillClose,
  MdFillAdd,
  MdFillLocation_on,
  MdFillOpen_in_new,
  MdOutlineEdit,
  MdOutlineDelete,
} from "solid-icons/md";
import DOMPurify from "dompurify";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { toast } from "@utsukta/spa-core/store/toast";
import type { CalEvent } from "../api";
import { deleteEvent } from "../api";
import CategoryChips from "./CategoryChips";
import { openEvent } from "@/shared/views/modal-host";
import { fmtEventRange } from "./calUtils";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";
import Modal from "@/shared/views/Modal";
import { iconBtn, primaryPill } from "@/shared/views/ui";
import { Motion, pop, slideDown } from "@/shared/views/anim";

interface Props {
  date: string;
  events: CalEvent[];
  onClose: () => void;
  onEventCreated?: () => void;
  onEventEdited?: () => void;
  onEventDeleted?: () => void;
}

export default function DayDetailModal(props: Props) {
  const { t, locale } = useI18n();
  const role = useViewerRole();
  // New events always go to the viewer's own calendar — creation requires a
  // local channel on this server, same as the header's New event button.
  const canCreate = () => role() === "owner";
  const [activeEventId, setActiveEventId] = createSignal<number | null>(null);
  // The creator is hosted by ModalHost, so this modal steps aside for it: left
  // open, its showModal() would make a docked or minimized creator inert.
  // Callbacks are read now — this component is disposed by the onClose below.
  function create() {
    const onCreated = props.onEventCreated;
    props.onClose();
    openEvent({ defaultDate: props.date, onCreated });
  }
  function edit(event: CalEvent) {
    const onEdited = props.onEventEdited;
    props.onClose();
    openEvent({ event, onEdited });
  }

  const dateLabel = () =>
    new Date(props.date + "T00:00:00").toLocaleDateString(locale(), {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const evCount = () => props.events.length;

  const titleId = createUniqueId();
  return (
    <Modal
      onClose={props.onClose}
      labelledBy={titleId}
      bare
      class="fixed inset-0 w-full h-full z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-sm"
    >
      <Motion.div {...pop}
        class="bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div class="flex items-start justify-between gap-3 px-6 pt-6 pb-3 shrink-0">
          <div class="min-w-0">
            <h2 id={titleId} class="text-lg font-semibold text-txt leading-snug">{dateLabel()}</h2>
            <Show when={evCount() > 0}>
              <p class="text-xs text-muted mt-0.5 tabular-nums">
                {t("calendar.events_count", { count: String(evCount()) })}
              </p>
            </Show>
          </div>
          <button type="button" onClick={props.onClose} class={`${iconBtn} -mr-2 -mt-1`}
            title={t("layout.close")} aria-label={t("layout.close")}>
            <MdFillClose size={18} />
          </button>
        </div>

        {/* Event list */}
        <div class="overflow-y-auto flex-1 px-3 pb-2 space-y-0.5">
          <Show
            when={evCount() > 0}
            fallback={<p class="px-3 py-8 text-sm text-muted text-center">{t("calendar.no_events")}</p>}
          >
            <For each={props.events}>
              {(ev) => {
                const open = () => activeEventId() === ev.id;
                return (
                  <div class={`rounded-xl transition-colors ${open() ? "bg-elevated/60" : "hover:bg-elevated/40"}`}>
                    <button
                      type="button"
                      aria-expanded={open()}
                      onClick={() => setActiveEventId((prev) => (prev === ev.id ? null : ev.id))}
                      class="w-full text-left px-3 py-2 flex items-start gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <span
                        class="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-accent"
                        style={ev.calendarColor ? { background: ev.calendarColor } : undefined}
                      />
                      <span class="min-w-0 flex-1">
                        <span class={`block text-sm font-medium leading-snug ${open() ? "text-accent-txt" : "text-txt"}`}>
                          {ev.title || t("calendar.no_title")}
                        </span>
                        <span class="block text-xs text-muted mt-0.5 tabular-nums">
                          {fmtEventRange(ev, locale(), t("calendar.all_day"))}
                          {!ev.allDay && ev.timezone !== "UTC" ? ` (${ev.timezone})` : ""}
                        </span>
                        <Show when={ev.location}>
                          <span class="flex items-center gap-1 text-xs text-muted mt-0.5">
                            <MdFillLocation_on size={12} class="shrink-0" />
                            <span class="truncate">{ev.location}</span>
                          </span>
                        </Show>
                      </span>
                    </button>

                    <Show when={open()}>
                      <EventDetailPanel
                        event={ev}
                        onEdit={() => edit(ev)}
                        onDeleted={() => {
                          setActiveEventId(null);
                          props.onEventDeleted?.();
                        }}
                      />
                    </Show>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>

        <Show when={canCreate()}>
          <div class="px-6 pt-2 pb-6 shrink-0 flex justify-end">
            <button type="button" onClick={create} class={primaryPill}>
              <MdFillAdd size={18} />
              {t("calendar.new_event")}
            </button>
          </div>
        </Show>
      </Motion.div>
    </Modal>
  );
}

function EventDetailPanel(props: { event: CalEvent; onEdit: () => void; onDeleted: () => void }) {
  const ev = props.event;
  const { t } = useI18n();
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const sanitized = () =>
    ev.description ? DOMPurify.sanitize(bbcodeDisplay(ev.description)) : "";

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteEvent(ev.id, { calendarId: ev.calendarId, uri: ev.uri });
      props.onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("calendar.failed_delete"));
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Motion.div {...slideDown} class="pl-8 pr-2 pb-2 space-y-2">
      <Show when={sanitized()}>
        <div class="text-sm text-txt leading-relaxed prose prose-sm max-w-none" innerHTML={sanitized()} />
      </Show>

      <CategoryChips categories={ev.categories} />

      <Show
        when={!confirming()}
        fallback={
          <div class="flex items-center gap-3 flex-wrap py-1">
            <span class="text-xs text-muted">{t("calendar.delete_event_confirm")}</span>
            <button type="button" disabled={deleting()} onClick={handleDelete}
              class="text-xs font-medium text-red-500 hover:underline disabled:opacity-50">
              {deleting() ? t("calendar.deleting_event") : t("calendar.delete_event")}
            </button>
            <button type="button" onClick={() => setConfirming(false)}
              class="text-xs text-muted hover:text-txt transition-colors">
              {t("calendar.cancel")}
            </button>
          </div>
        }
      >
        <div class="flex items-center -ml-2">
          <Show when={ev.plink}>
            <a href={ev.plink} target="_blank" rel="noopener noreferrer" class={iconBtn}
              title={t("calendar.view_source")} aria-label={t("calendar.view_source")}>
              <MdFillOpen_in_new size={16} />
            </a>
          </Show>
          <Show when={ev.rw}>
            <Show when={ev.editable !== false}>
              <button type="button" onClick={props.onEdit} class={iconBtn}
                title={t("calendar.edit_event")} aria-label={t("calendar.edit_event")}>
                <MdOutlineEdit size={16} />
              </button>
            </Show>
            <button type="button" onClick={() => setConfirming(true)} class={`${iconBtn} hover:text-red-500!`}
              title={t("calendar.delete_event")} aria-label={t("calendar.delete_event")}>
              <MdOutlineDelete size={16} />
            </button>
          </Show>
        </div>
      </Show>
    </Motion.div>
  );
}
