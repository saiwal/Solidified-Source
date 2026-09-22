import { createSignal, Show, For, onMount, onCleanup, createUniqueId } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import { createEvent, editEvent } from "../api";
import type { CalEvent, CreateEventInput } from "../api";
import { fetchCdavCalendars } from "../api/cdav";
import { useI18n } from "@utsukta/spa-core/i18n";
import RichEditor from "@/shared/editor/core/RichEditor";
import { CAPABILITIES, type EditorTab } from "@/shared/editor/types/editor.types";
import AttachmentBar from "@/shared/editor/attachments/AttachmentBar";
import { createAttachmentStore } from "@/shared/editor/attachments/useAttachments";
import { useAttachmentActions } from "@/shared/editor/attachments/useAttachmentActions";
import EditorStats from "@/shared/editor/components/EditorStats";
import { countWords } from "@/shared/editor/lib/textStats";
import { bbcodeToInsert, patchInsertedAlt } from "@/shared/editor/attachments/insertHelpers";
import { currentNick, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import AclPicker, { aclModeToScope } from "@/shared/editor/components/AclPicker";
import { useAclState, splitAclEntries } from "@/shared/editor/components/useAclState";
import CategoryTagsField from "@/shared/editor/components/CategoryTagsField";
import { useCategoryTags } from "@/shared/editor/components/useCategoryTags";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import { prevDay, nextDay, zonedTimeToUtc, utcToZonedDateTime } from "../views/calUtils";
import { MdOutlineClose, MdOutlineExpand_more } from "solid-icons/md";

import Modal from "@/shared/views/Modal";
function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
  }
}

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  onEdited?: () => void;
  defaultDate?: string; // YYYY-MM-DD, pre-fills start date
  /** When provided, the modal is in edit mode */
  event?: CalEvent;
}

interface CalendarOption {
  label: string;
  color: string;
  calendarId?: number;
  calendarInstanceId?: number;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// All-day events store a calendar date with no timezone adjustment — use the
// raw date string. Timed events are shown in `tz` (the event's own zone when
// Event Timezone Selection is on and editing, otherwise the browser's zone).
function isoToDate(iso: string, allDay: boolean, tz: string) {
  return allDay ? iso.slice(0, 10) : utcToZonedDateTime(iso, tz).date;
}
function isoToTime(iso: string, tz: string) {
  return utcToZonedDateTime(iso, tz).time;
}

export default function EventCreatorModal(props: Props) {
  const { t } = useI18n();
  const ev = props.event;
  const isEdit = !!ev;
  const tzSelectable = isFeatureEnabled("event_tz_select");
  // Editing an event authored in a different zone: show/edit its wall-clock
  // time as originally entered, not converted to the browser's own zone.
  const initialTz = ev?.timezone && tzSelectable
    ? ev.timezone
    : Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [title, setTitle] = createSignal(ev?.title ?? "");
  const [allDay, setAllDay] = createSignal(ev?.allDay ?? false);
  const [startDate, setStartDate] = createSignal(ev ? isoToDate(ev.start, ev.allDay, initialTz) : (props.defaultDate ?? todayDate()));
  const [startTime, setStartTime] = createSignal(ev && !ev.allDay ? isoToTime(ev.start, initialTz) : "09:00");
  const [nofinish, setNofinish] = createSignal(ev?.nofinish ?? false);
  // Stored dtend for all-day events is exclusive (end date + 1 day, matching
  // classic Hubzilla) — shift back a day so the picker shows the last
  // inclusive day the user actually picked.
  const [endDate, setEndDate] = createSignal(
    ev?.end
      ? (ev.allDay ? prevDay(isoToDate(ev.end, true, initialTz)) : isoToDate(ev.end, false, initialTz))
      : (props.defaultDate ?? todayDate())
  );
  const [endTime, setEndTime] = createSignal(ev?.end && !ev.allDay ? isoToTime(ev.end, initialTz) : "10:00");
  const [location, setLocation] = createSignal(ev?.location ?? "");
  // Comma string, matching core's categories field (and the join core uses when it
  // prefills its own form) so useCategoryTags can drive it directly.
  const [category, setCategory] = createSignal(ev?.categories?.join(", ") ?? "");
  const [description, setDescription] = createSignal(ev?.description ?? "");
  const [descriptionTab, setDescriptionTab] = createSignal<EditorTab>("wysiwyg");
  const attach = createAttachmentStore(currentNick(), `event:${ev?.id ?? "new"}`);
  // Owned here so the editor toolbar and the attachment bar drive the same
  // upload/browse/camera flows (the buttons live in the toolbar now).
  const attachActions = useAttachmentActions(() => attach, currentNick, () => "both");
  const [submitting, setSubmitting] = createSignal(false);
  const [selectedCalIdx, setSelectedCalIdx] = createSignal(0);
  const [timezone, setTimezone] = createSignal(initialTz);

  const [calData] = createQueryResource("cdav-calendars", fetchCdavCalendars);

  const calendarOptions = (): CalendarOption[] => {
    const d = calData();
    const opts: CalendarOption[] = [
      {
        label: d?.channel_calendar?.displayname ?? t("calendar.channel_calendar"),
        color: d?.channel_calendar?.color ?? "#3a87ad",
      },
    ];
    if (d?.has_cdav) {
      for (const cal of d.my_calendars) {
        opts.push({ label: cal.displayname, color: cal.color, calendarId: cal.id as number, calendarInstanceId: cal.instanceId });
      }
      for (const cal of d.shared_calendars) {
        if (cal.access === "read-write") {
          opts.push({ label: cal.displayname, color: cal.color, calendarId: cal.id as number, calendarInstanceId: cal.instanceId });
        }
      }
    }
    return opts;
  };

  // Audience picker only applies to the channel calendar (native event+item
  // rows) — CalDAV events have no ACL concept in this app.
  const isNativeTarget = () =>
    isEdit ? !ev?.calendarId : !calendarOptions()[selectedCalIdx()]?.calendarId;

  // Suggestions come from the channel's existing post categories — event items are
  // ordinary thread-top wall items, so the "posts" list already includes categories
  // used on events. Same wiring as PostComposer.
  const [existingCategories] = createQueryResource(
    "event-categories",
    () => ({ channelNick: currentNick(), type: "posts" as const }),
    fetchCategories,
  );
  const categoryTags = useCategoryTags(
    category,
    setCategory,
    () => (existingCategories() ?? []).map((c) => c.name),
  );

  const acl = useAclState({
    mode: ev?.scope === "private" ? "me" : ev?.scope === "custom" ? "custom" : "public",
    allowEntries: [
      ...(ev?.contactAllow ?? []).map((h) => `c:${h}`),
      ...(ev?.groupAllow ?? []).map((h) => `g:${h}`),
    ],
    denyEntries: [
      ...(ev?.contactDeny ?? []).map((h) => `c:${h}`),
      ...(ev?.groupDeny ?? []).map((h) => `g:${h}`),
    ],
  });

  let titleRef!: HTMLInputElement;
  onMount(() => titleRef?.focus());

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") props.onClose();
  }
  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!title().trim()) { toast.error(t("calendar.title_required")); return; }

    setSubmitting(true);

    try {
      // All-day: send a bare UTC midnight so PHP stores the calendar date unchanged.
      // Timed: interpret the entered wall-clock time in the selected timezone
      // (browser-local by default, or whatever Event Timezone Selection picked).
      const startIso = allDay()
        ? `${startDate()}T00:00:00Z`
        : zonedTimeToUtc(startDate(), startTime(), timezone()).toISOString();

      // All-day dtend is stored exclusive (end date + 1 day) — same convention
      // classic Hubzilla's calendar (Cdav.php) uses for CalDAV and channel events.
      const endIso = !nofinish() && endDate()
        ? allDay()
          ? `${nextDay(endDate())}T00:00:00Z`
          : zonedTimeToUtc(endDate(), endTime(), timezone()).toISOString()
        : undefined;

      if (endIso && endIso < startIso) {
        toast.error("End time must not be before start time.");
        setSubmitting(false);
        return;
      }

      // Audience — only meaningful for the channel calendar (native events);
      // CalDAV targets have no ACL concept in this app.
      let aclPayload: Pick<CreateEventInput, "scope" | "contact_allow" | "group_allow" | "contact_deny" | "group_deny"> = {};
      if (isNativeTarget()) {
        if (acl.mode() === "custom" && acl.allowEntries().size === 0) {
          throw new Error("Select at least one connection or group to allow.");
        }
        const allow = splitAclEntries(acl.allowEntries());
        const deny = splitAclEntries(acl.denyEntries());
        aclPayload = {
          scope: aclModeToScope(acl.mode()),
          contact_allow: allow.contactIds,
          group_allow: allow.groupIds,
          contact_deny: deny.contactIds,
          group_deny: deny.groupIds,
        };
      }

      if (isEdit && ev) {
        await editEvent(ev.id, {
          title: title().trim(),
          description: description().trim() || undefined,
          location: location().trim() || undefined,
          start: startIso,
          end: endIso,
          allDay: allDay(),
          nofinish: nofinish(),
          timezone: timezone(),
          // Sent unconditionally (empty string included) so clearing every category
          // actually clears it — the server treats the key's presence as
          // authoritative and leaves stored categories alone when it's absent.
          ...(isNativeTarget() ? { categories: category().trim() } : {}),
          ...aclPayload,
          calendarId: ev.calendarId,
          uri: ev.uri,
        });
        props.onEdited?.();
      } else {
        const selectedCal = calendarOptions()[selectedCalIdx()];
        await createEvent({
          title: title().trim(),
          description: description().trim() || undefined,
          location: location().trim() || undefined,
          start: startIso,
          end: endIso,
          allDay: allDay(),
          nofinish: nofinish(),
          timezone: timezone(),
          ...(isNativeTarget() ? { categories: category().trim() } : {}),
          ...aclPayload,
          calendarId: selectedCal?.calendarId,
          calendarInstanceId: selectedCal?.calendarInstanceId,
        });
        props.onCreated?.();
      }
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("calendar.failed_create"));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "bg-overlay border border-rim rounded-lg px-3 py-2 text-sm text-txt " +
    "placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 w-full";

  const titleId = createUniqueId();
  return (
    <Modal
      onClose={props.onClose}
      labelledBy={titleId}
      bare
      class="fixed inset-0 w-full h-full z-[60] flex items-center justify-center p-4 bg-black/50"
    >
      <div class="bg-surface border border-rim rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div class="flex items-center justify-between px-5 pt-5 pb-4 border-b border-rim shrink-0">
          <h2 id={titleId} class="text-base font-semibold text-txt">
            {isEdit ? t("calendar.edit_event") : t("calendar.new_event")}
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            class="p-1.5 rounded-lg text-muted hover:bg-elevated hover:text-txt transition-colors"
            aria-label="Close"
          >
            <MdOutlineClose class="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} class="flex-1 p-5 flex flex-col gap-4 overflow-y-auto min-h-0">

          {/* Calendar picker — only shown when creating and multiple options exist */}
          <Show when={!isEdit && calendarOptions().length > 1}>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-muted">{t("calendar.calendar_label")}</label>
              <div class="relative">
                <select
                  value={selectedCalIdx()}
                  onChange={(e) => setSelectedCalIdx(parseInt(e.currentTarget.value))}
                  class={inputClass + " appearance-none pr-8 cursor-pointer"}
                >
                  <For each={calendarOptions()}>
                    {(opt, i) => (
                      <option value={i()}>{opt.label}</option>
                    )}
                  </For>
                </select>
                {/* Color dot overlay */}
                <span
                  class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
                  style={{ background: calendarOptions()[selectedCalIdx()]?.color ?? "#3a87ad" }}
                />
                <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted">
                  <MdOutlineExpand_more class="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </Show>

          {/* Title */}
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-muted">{t("calendar.title_label")}</label>
            <input
              ref={titleRef!}
              type="text"
              required
              placeholder={t("calendar.title_placeholder") as string}
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              class={inputClass}
            />
          </div>

          {/* All-day toggle */}
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allDay()}
              onChange={(e) => setAllDay(e.currentTarget.checked)}
              class="w-4 h-4 rounded accent-accent"
            />
            <span class="text-sm text-txt">{t("calendar.all_day")}</span>
          </label>

          {/* Start */}
          <div class="flex gap-2">
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-xs font-medium text-muted">{t("calendar.start_label")}</label>
              <input
                type="date"
                required
                value={startDate()}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setStartDate(v);
                  // Keep a stale end date (e.g. left over from the day cell
                  // that opened this modal) from silently producing an
                  // end-before-start event.
                  if (endDate() < v) setEndDate(v);
                }}
                class={inputClass}
              />
            </div>
            <Show when={!allDay()}>
              <div class="flex flex-col gap-1 w-28">
                <label class="text-xs font-medium text-muted">{t("calendar.time_label")}</label>
                <input
                  type="time"
                  value={startTime()}
                  onChange={(e) => setStartTime(e.currentTarget.value)}
                  class={inputClass}
                />
              </div>
            </Show>
          </div>

          {/* Timezone — only when "Event Timezone Selection" is enabled and the event has a time */}
          <Show when={tzSelectable && !allDay()}>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-muted">{t("calendar.timezone_label")}</label>
              <select
                value={timezone()}
                onChange={(e) => setTimezone(e.currentTarget.value)}
                class={inputClass + " appearance-none cursor-pointer"}
              >
                <For each={timezones()}>
                  {(tz) => <option value={tz}>{tz}</option>}
                </For>
              </select>
            </div>
          </Show>

          {/* No-end toggle */}
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={nofinish()}
              onChange={(e) => setNofinish(e.currentTarget.checked)}
              class="w-4 h-4 rounded accent-accent"
            />
            <span class="text-sm text-txt">{t("calendar.no_end_time")}</span>
          </label>

          {/* End */}
          <Show when={!nofinish()}>
            <div class="flex gap-2">
              <div class="flex flex-col gap-1 flex-1">
                <label class="text-xs font-medium text-muted">{t("calendar.end_label")}</label>
                <input
                  type="date"
                  value={endDate()}
                  onInput={(e) => setEndDate(e.currentTarget.value)}
                  class={inputClass}
                />
              </div>
              <Show when={!allDay()}>
                <div class="flex flex-col gap-1 w-28">
                  <label class="text-xs font-medium text-muted">{t("calendar.time_label")}</label>
                  <input
                    type="time"
                    value={endTime()}
                    onChange={(e) => setEndTime(e.currentTarget.value)}
                    class={inputClass}
                  />
                </div>
              </Show>
            </div>
          </Show>

          {/* Location */}
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-muted">{t("calendar.location_label")}</label>
            <input
              type="text"
              placeholder={t("calendar.optional") as string}
              value={location()}
              onInput={(e) => setLocation(e.currentTarget.value)}
              class={inputClass}
            />
          </div>

          {/* Categories — channel calendar only, mirroring core, which hides its own
              category field unless the target is the channel calendar. */}
          <Show when={isNativeTarget()}>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-muted">{t("calendar.categories_label")}</label>
              <CategoryTagsField
                showLabel
                hideLabel
                tags={categoryTags.categoryTags}
                pending={categoryTags.pendingCategory}
                onPendingInput={categoryTags.setPendingCategory}
                onKeyDown={categoryTags.onCategoryKeyDown}
                onRemove={categoryTags.removeCategoryTag}
                onBlur={() => {
                  if (categoryTags.pendingCategory().trim()) {
                    categoryTags.addCategoryTag(categoryTags.pendingCategory());
                  }
                }}
                suggestions={categoryTags.suggestions}
                activeSuggestion={categoryTags.activeSuggestion}
                onSelectSuggestion={categoryTags.addCategoryTag}
                placeholder={t("calendar.categories_placeholder") as string}
              />
            </div>
          </Show>

          {/* Description */}
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-muted">{t("calendar.description_label")}</label>
            <RichEditor
              attach={attachActions}
              body={description()}
              onInput={setDescription}
              capabilities={CAPABILITIES.comment}
              tab={descriptionTab()}
              onTabChange={setDescriptionTab}
              onPasteFiles={(files) => attach.addUploads(files)}
              placeholder={t("calendar.optional") as string}
              minHeight="80px"
              resizable
            />
            {/* Same shape as every composer: counts plus the borderless source
                toggle here, upload/browse/camera in the toolbar, and the bar
                reduced to attachment chips (it collapses when there are none). */}
            <EditorStats
              words={() => countWords(description())}
              chars={() => description().length}
              tab={descriptionTab()}
              onToggleTab={() => setDescriptionTab(descriptionTab() === "wysiwyg" ? "source" : "wysiwyg")}
            />
            <AttachmentBar
              store={attach}
              actions={attachActions}
              nick={currentNick()}
              accept="both"
              onInsert={(bbcode) => setDescription(description() + "\n" + bbcodeToInsert(bbcode, "text/bbcode"))}
              onAltChange={(att) => setDescription(patchInsertedAlt(description(), att, "text/bbcode"))}
            />
          </div>

          {/* Actions */}
          <div class="flex items-center gap-2 pt-1">
            {/* Audience — channel calendar (native events) only; CalDAV
                calendars have no ACL concept in this app. */}
            <Show when={isNativeTarget()}>
              <AclPicker
                mode={acl.mode()}
                onModeChange={acl.setMode}
                allowEntries={acl.allowEntries()}
                denyEntries={acl.denyEntries()}
                onToggle={acl.toggleEntry}
                onClear={acl.clearEntries}
              />
            </Show>

            <div class="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={props.onClose}
                class="px-4 py-1.5 rounded-lg text-xs font-medium text-muted hover:bg-elevated hover:text-txt transition-colors"
              >
                {t("calendar.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting()}
                class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-accent text-accent-fg
                       hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {submitting()
                  ? (isEdit ? t("calendar.saving") : t("calendar.creating"))
                  : (isEdit ? t("calendar.save_event") : t("calendar.create_event"))}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
