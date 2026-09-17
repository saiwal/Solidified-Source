import { createSignal, Show, For, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import {
  MdFillClose,
  MdFillAdd,
  MdFillLocation_on,
  MdFillOpen_in_new,
  MdFillEdit,
  MdFillDelete,
} from "solid-icons/md";
import DOMPurify from "dompurify";
import { bbcodeToHtml } from "@utsukta/spa-core/lib/bbcode";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { toast } from "@utsukta/spa-core/store/toast";
import type { CalEvent } from "../api";
import { deleteEvent } from "../api";
import CategoryChips from "./CategoryChips";
import EventCreatorModal from "../widgets/EventCreatorModal";
import { fmtEventRange } from "./calUtils";

function fmtFullDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
  const auth = useAuth();
  // New events always go to the viewer's own calendar — creation requires a
  // local channel on this server, same as CalView's header button.
  const canCreate = () => auth()?.isLocal === true;
  const [activeEventId, setActiveEventId] = createSignal<number | null>(null);
  const [showCreator, setShowCreator] = createSignal(false);
  const [editingEvent, setEditingEvent] = createSignal<CalEvent | null>(null);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" && !showCreator()) props.onClose();
  }
  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  const dateLabel = () =>
    new Date(props.date + "T00:00:00").toLocaleDateString(locale(), {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  const evCount = () => props.events.length;

  return (
    <>
      <Portal mount={document.body}>
      <div
        class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
        style={{ background: "rgba(0,0,0,0.55)" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="bg-surface border border-rim rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div class="flex items-start justify-between px-5 pt-5 pb-4 border-b border-rim shrink-0 gap-3">
            <div class="min-w-0">
              <h2 class="text-base font-semibold text-txt leading-snug">{dateLabel()}</h2>
              <p class="text-xs text-muted mt-0.5">
                {evCount() === 0
                  ? t("calendar.no_events")
                  : `${evCount()} event${evCount() === 1 ? "" : "s"}`}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <Show when={canCreate()}>
                <button
                  type="button"
                  onClick={() => setShowCreator(true)}
                  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                         bg-accent text-accent-fg hover:opacity-90 transition-opacity"
                >
                  <MdFillAdd size={14} />
                  {t("calendar.new_event")}
                </button>
              </Show>
              <button
                type="button"
                onClick={props.onClose}
                class="p-1.5 rounded-lg text-muted hover:bg-elevated hover:text-txt transition-colors"
                aria-label="Close"
              >
                <MdFillClose size={16} />
              </button>
            </div>
          </div>

          {/* Event list */}
          <div class="overflow-y-auto flex-1 p-4 space-y-2">
            <Show
              when={evCount() > 0}
              fallback={
                <div class="flex flex-col items-center py-10 gap-2 text-center">
                  <p class="text-sm text-muted">{t("calendar.no_events")}</p>
                  <Show when={canCreate()}>
                    <button
                      type="button"
                      onClick={() => setShowCreator(true)}
                      class="text-xs text-accent hover:underline mt-1"
                    >
                      {t("calendar.add_event_here")}
                    </button>
                  </Show>
                </div>
              }
            >
              <For each={props.events}>
                {(ev) => (
                  <div>
                    <button
                      onClick={() =>
                        setActiveEventId((prev) =>
                          prev === ev.id ? null : ev.id,
                        )
                      }
                      class={`w-full text-left rounded-xl border p-3 transition-colors
                        ${activeEventId() === ev.id
                          ? "border-accent bg-accent-muted"
                          : "border-rim bg-surface hover:bg-elevated hover:border-rim-strong"}`}
                    >
                      <p class="text-sm font-medium text-txt leading-snug">
                        {ev.title || t("calendar.no_title")}
                      </p>
                      <p class="text-xs text-muted mt-0.5">
                        {fmtEventRange(ev, locale(), t("calendar.all_day"))}
                      </p>
                      <Show when={ev.location}>
                        <p class="flex items-center gap-1 text-xs text-muted mt-0.5">
                          <MdFillLocation_on size={12} />
                          {ev.location}
                        </p>
                      </Show>
                    </button>

                    <Show when={activeEventId() === ev.id}>
                      <EventDetailPanel
                        event={ev}
                        onEdit={() => setEditingEvent(ev)}
                        onDeleted={() => {
                          setActiveEventId(null);
                          props.onEventDeleted?.();
                        }}
                      />
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
      </Portal>

      <Show when={showCreator()}>
        <EventCreatorModal
          defaultDate={props.date}
          onClose={() => setShowCreator(false)}
          onCreated={() => {
            setShowCreator(false);
            props.onEventCreated?.();
          }}
        />
      </Show>

      <Show when={editingEvent() !== null}>
        <EventCreatorModal
          event={editingEvent()!}
          onClose={() => setEditingEvent(null)}
          onEdited={() => {
            setEditingEvent(null);
            props.onEventEdited?.();
          }}
        />
      </Show>
    </>
  );
}

function EventDetailPanel(props: { event: CalEvent; onEdit: () => void; onDeleted: () => void }) {
  const ev = props.event;
  const { t, locale } = useI18n();
  const [confirming, setConfirming] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const sanitized = () =>
    ev.description ? DOMPurify.sanitize(bbcodeToHtml(ev.description)) : "";

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
    <div class="mt-1 ml-3 bg-base border border-rim/60 rounded-xl p-3.5 space-y-2">
      <div class="text-xs text-muted space-y-0.5">
        <p>{fmtFullDate(ev.start, locale())}</p>
        <Show when={!ev.allDay}>
          <p>
            {fmtEventRange(ev, locale(), t("calendar.all_day"))}
            {ev.timezone !== "UTC" ? ` (${ev.timezone})` : ""}
          </p>
        </Show>
        <Show when={ev.allDay}>
          <p>{t("calendar.all_day_event")}</p>
        </Show>
      </div>

      <Show when={sanitized()}>
        <div
          class="text-sm text-txt leading-relaxed prose prose-sm max-w-none"
          innerHTML={sanitized()}
        />
      </Show>

      <CategoryChips categories={ev.categories} />

      <div class="flex items-center gap-3 pt-0.5">
        <Show when={ev.plink}>
          <a
            href={ev.plink}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <MdFillOpen_in_new size={12} />
            {t("calendar.view_source")}
          </a>
        </Show>
        <Show when={ev.rw}>
          <button
            type="button"
            onClick={props.onEdit}
            class="inline-flex items-center gap-1 text-xs text-muted hover:text-txt transition-colors"
          >
            <MdFillEdit size={12} />
            {t("calendar.edit_event")}
          </button>
          <Show
            when={confirming()}
            fallback={
              <button
                type="button"
                onClick={() => setConfirming(true)}
                class="inline-flex items-center gap-1 text-xs text-muted hover:text-error transition-colors"
              >
                <MdFillDelete size={12} />
                {t("calendar.delete_event")}
              </button>
            }
          >
            <span class="text-xs text-muted">{t("calendar.delete_event_confirm")}</span>
            <button
              type="button"
              disabled={deleting()}
              onClick={handleDelete}
              class="text-xs font-medium text-error hover:underline disabled:opacity-50"
            >
              {deleting() ? t("calendar.deleting_event") : t("calendar.delete_event")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              class="text-xs text-muted hover:text-txt transition-colors"
            >
              {t("calendar.cancel")}
            </button>
          </Show>
        </Show>
      </div>
    </div>
  );
}
