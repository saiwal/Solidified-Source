// src/shared/stream/components/EventCard.tsx
import { createSignal, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { apiRsvpAttend, apiRsvpDecline, apiRsvpMaybe } from "@utsukta/spa-core/lib/item-api";
import type { ThreadNode } from "@utsukta/spa-core/lib/thread";
import type { EventData } from "@utsukta/spa-core/types/post.types";
import { Button } from "@ui/Button";

function formatEventDate(iso: string, locale: string, adjust?: boolean): string {
  if (!iso) return "";
  try {
    return new Date(iso.replace(" ", "T") + "Z").toLocaleString(locale, {
      weekday: "short", year: "numeric", month: "short",
      day: "numeric", hour: "2-digit", minute: "2-digit",
      timeZone: adjust ? undefined : "UTC",
    });
  } catch {
    return iso;
  }
}

export default function EventCard(props: {
  post: ThreadNode;
  event: EventData;
}) {
  const { locale } = useI18n();
  const auth = useAuth();

  const canRsvp = () => auth()?.isLocal === true && !!props.post.uuid;

  const [attending,    setAttending]    = createSignal(props.post.viewerAttending ?? false);
  const [declining,    setDeclining]    = createSignal(props.post.viewerDeclining ?? false);
  const [maybe,        setMaybe]        = createSignal(props.post.viewerMaybe     ?? false);
  const [attendCount,  setAttendCount]  = createSignal(props.post.attendCount  ?? 0);
  const [declineCount, setDeclineCount] = createSignal(props.post.declineCount ?? 0);
  const [maybeCount,   setMaybeCount]   = createSignal(props.post.maybeCount   ?? 0);
  const [pending,      setPending]      = createSignal(false);

  async function rsvp(verb: "accept" | "reject" | "tentativeaccept") {
    if (!props.post.uuid || pending()) return;
    setPending(true);
    try {
      const fn = verb === "accept" ? apiRsvpAttend
               : verb === "reject" ? apiRsvpDecline
               : apiRsvpMaybe;
      const res = await fn(props.post.uuid);
      const added = res.state === "added";
      setAttending(verb === "accept"           ? added : false);
      setDeclining(verb === "reject"           ? added : false);
      setMaybe    (verb === "tentativeaccept"  ? added : false);
      setAttendCount(res.attend_count);
      setDeclineCount(res.decline_count);
      setMaybeCount(res.maybe_count);
    } catch {
      // silently fail
    } finally {
      setPending(false);
    }
  }

  const startDate  = () => formatEventDate(props.event.start,  locale(), props.event.adjust);
  const finishDate = () => formatEventDate(props.event.finish, locale(), props.event.adjust);

  const isUpcoming = () => {
    try { return new Date(props.event.start.replace(" ", "T") + "Z") > new Date(); }
    catch { return false; }
  };

  return (
    <div class="mt-3 space-y-2.5">
      {/* Description */}
      <Show when={props.event.description}>
        <div
          class="text-sm text-txt leading-relaxed prose prose-sm max-w-none"
          innerHTML={props.event.description}
        />
      </Show>

      {/* Dates */}
      <div class="space-y-1 text-sm">
        <div class="flex items-center gap-2 text-muted">
          <svg class="w-4 h-4 shrink-0 text-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8"  y1="2" x2="8"  y2="6"/>
            <line x1="3"  y1="10" x2="21" y2="10"/>
          </svg>
          <span>
            <span class="text-txt font-medium">{startDate()}</span>
            <Show when={isUpcoming()}>
              <span class="ml-2 text-xs text-accent font-medium">· Upcoming</span>
            </Show>
          </span>
        </div>
        <Show when={props.event.finish}>
          <div class="flex items-center gap-2 text-muted pl-6">
            <span class="text-muted text-xs">until</span>
            <span>{finishDate()}</span>
          </div>
        </Show>
        <Show when={props.event.location}>
          <div class="flex items-center gap-2 text-muted">
            <svg class="w-4 h-4 shrink-0 text-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span class="break-words min-w-0">{props.event.location}</span>
          </div>
        </Show>
      </div>

      {/* RSVP row */}
      <Show when={canRsvp()}>
        <div class="flex items-center gap-2 flex-wrap">
          <RsvpBtn
            label="Attend"
            count={attendCount()}
            active={attending()}
            activeClass="bg-success/15! text-success-txt! border-success/40!"
            onClick={() => rsvp("accept")}
            disabled={pending()}
          />
          <RsvpBtn
            label="Maybe"
            count={maybeCount()}
            active={maybe()}
            activeClass="bg-warning/15! text-warning-txt! border-warning/40!"
            onClick={() => rsvp("tentativeaccept")}
            disabled={pending()}
          />
          <RsvpBtn
            label="Decline"
            count={declineCount()}
            active={declining()}
            activeClass="bg-danger/15! text-danger-txt! border-danger/40!"
            onClick={() => rsvp("reject")}
            disabled={pending()}
          />
        </div>
      </Show>

      {/* Read-only counts */}
      <Show when={!canRsvp() && (attendCount() > 0 || declineCount() > 0 || maybeCount() > 0)}>
        <div class="flex items-center gap-3 text-xs text-muted">
          <Show when={attendCount() > 0}>
            <span class="text-success-txt">{attendCount()} attending</span>
          </Show>
          <Show when={maybeCount() > 0}>
            <span class="text-warning-txt">{maybeCount()} maybe</span>
          </Show>
          <Show when={declineCount() > 0}>
            <span class="text-danger-txt">{declineCount()} declined</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function RsvpBtn(props: {
  label: string;
  count: number;
  active: boolean;
  activeClass: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      pressed={props.active}
      class={`border ${props.active ? props.activeClass : "border-rim"}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      <span>{props.label}</span>
      <Show when={props.count > 0}>
        <span class={`font-semibold ${props.active ? "" : "text-subtle"}`}>
          {props.count}
        </span>
      </Show>
    </Button>
  );
}
