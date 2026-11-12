// Loaded only once Jellyfin is enabled — see NowPlayingWidget.tsx.
// Compact sidebar mini-player: cover + title/artist/album (opens /jellyfin,
// where NowPlayingPanel has the full controls), prev/play-pause/next below. Shows local
// playback, or — when nothing plays here — what another of the user's devices
// is playing, controlled remotely. Renders nothing when neither.
import { Show, onCleanup } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { toast } from "@utsukta/spa-core/store/toast";
import { MdFillPlay_arrow, MdFillPause, MdFillSkip_next, MdFillSkip_previous, MdFillGroups } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { imageUrl, type JellyfinSession, type JfItem } from "../api";
import { currentSession, sessionFor, current, hasNext, playing, loading, toggle, next, prev, syncFromHub } from "../store";
import { remotePlaying, remoteCommand, useRemotePolling } from "../remote";
import { Art } from "../ui";
import { IconButton } from "@ui/Button";
import { Motion, slideUp } from "../anim";
import { openPlayer } from "../chrome/player-ui";
// Imported here, in the always-mounted widget, so a reload rejoins its party
import { party, setPartyNavigator } from "../syncplay";
import { usePartyNotices } from "../party/PartyBar";
import { usePresence } from "../presence";
import { reminderDue } from "../settings";

/** Once a day at the chosen hour, offer the day's listening recap. */
function useRecapReminder() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const check = () => {
    if (reminderDue()) toast.info(t("jellyfin.reminder_toast"), 15_000, () => navigate("/jellyfin?recap=day"));
  };
  check();
  const timer = setInterval(check, 10 * 60_000);
  onCleanup(() => clearInterval(timer));
}

export default function MiniPlayer() {
  const { t } = useI18n();
  useRemotePolling();
  usePresence();
  useRecapReminder();
  usePartyNotices();
  // Sign this browser in to servers stored on the hub (once per page load)
  void syncFromHub();
  const navigate = useNavigate();
  setPartyNavigator((path) => navigate(path));
  onCleanup(() => setPartyNavigator(null));
  const remote = () => (current() ? null : remotePlaying()[0] ?? null);

  return (
    <Show
      when={current()}
      fallback={
        <Show when={remote()}>
          {(r) => (
            <Row
              s={sessionFor(r().srv)}
              item={r().item!}
              subtitle={t("jellyfin.on_device", { device: r().device })}
              playing={!r().paused}
              loading={false}
              controllable={r().controllable}
              hasNext
              onToggle={() => void remoteCommand(r(), "PlayPause")}
              onPrev={() => void remoteCommand(r(), "PreviousTrack")}
              onNext={() => void remoteCommand(r(), "NextTrack")}
            />
          )}
        </Show>
      }
    >
      {(track) => (
        <Row
          s={currentSession()}
          item={track()}
          subtitle={track().Artists?.join(", ") || track().AlbumArtist || ""}
          playing={playing()}
          loading={loading()}
          controllable
          local
          hasNext={hasNext()}
          onToggle={toggle}
          onPrev={prev}
          onNext={next}
        />
      )}
    </Show>
  );
}

function Row(props: {
  s: JellyfinSession | null;
  item: JfItem;
  subtitle: string;
  playing: boolean;
  loading: boolean;
  /** false = a remote session that can't take commands: show, don't control. */
  controllable: boolean;
  /** Playing here (not another device): a click also opens the full player. */
  local?: boolean;
  hasNext: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();

  // Cover, then a column with the details on top and the controls under
  // them, so title/artist get the full width beside the cover instead of
  // sharing one row with three buttons. The cover repeats the text's link
  // for the pointer only (one tab stop, one announcement).
  const open = () => { if (props.local) openPlayer(); };
  return (
    <Motion.div {...slideUp} class="flex w-full items-start gap-3 p-2 rounded-2xl bg-surface ring-1 ring-rim/40">
      <A href="/jellyfin" tabindex="-1" aria-hidden="true" class="shrink-0" onClick={open}>
        <Art src={props.s ? imageUrl(props.s, props.item, 160) : null} class="w-16 h-16" />
      </A>
      <div class="min-w-0 flex-1 flex flex-col gap-1">
        <A href="/jellyfin" title={t("jellyfin.open_player")} class="min-w-0 block" onClick={open}>
          <span class="flex items-start gap-1 text-sm font-medium leading-snug text-txt">
            <Show when={party()}>
              <span title={t("jellyfin.party_badge", { name: party()!.name })} class="shrink-0 mt-0.5 text-accent-txt"><MdFillGroups size={14} /></span>
            </Show>
            <span class="line-clamp-2 break-words">{props.item.Name}</span>
          </span>
          <Show when={props.subtitle}>
            <span class="block text-xs text-muted truncate">{props.subtitle}</span>
          </Show>
          <Show when={props.item.Album && props.item.Album !== props.item.Name}>
            <span class="block text-xs text-subtle truncate">{props.item.Album}</span>
          </Show>
        </A>
        <Show when={props.controllable}>
          <div class="flex items-center gap-1 -ml-1.5">
            <IconButton label={t("jellyfin.previous")} size="sm" onClick={() => props.onPrev()}>
              <MdFillSkip_previous size={20} />
            </IconButton>
            <IconButton
              label={props.playing ? t("jellyfin.pause") : t("jellyfin.play")}
              size="sm"
              class={props.loading ? "animate-pulse" : ""}
              onClick={() => props.onToggle()}
            >
              <Show when={props.playing} fallback={<MdFillPlay_arrow size={24} />}>
                <MdFillPause size={24} />
              </Show>
            </IconButton>
            <IconButton
              label={t("jellyfin.next")}
              size="sm"
              disabled={!props.hasNext}
              onClick={() => props.onNext()}
            >
              <MdFillSkip_next size={20} />
            </IconButton>
          </div>
        </Show>
      </div>
    </Motion.div>
  );
}
