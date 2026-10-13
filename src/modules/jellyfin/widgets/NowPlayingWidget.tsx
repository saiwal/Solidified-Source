// Compact sidebar mini-player: cover thumbnail + title (opens /jellyfin, where
// NowPlayingPanel has the full controls), prev/play-pause/next. Shows local
// playback, or — when nothing plays here — what another of the user's devices
// is playing, controlled remotely. Renders nothing when neither.
import { Show, onCleanup } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { toast } from "@utsukta/spa-core/store/toast";
import { MdFillPlay_arrow, MdFillPause, MdFillSkip_next, MdFillSkip_previous, MdFillGroups } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isModuleActive } from "@utsukta/spa-core/module-registry";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";
import { imageUrl, type JellyfinSession, type JfItem } from "../api";
import { currentSession, sessionFor, current, hasNext, playing, loading, toggle, next, prev } from "../store";
import { remotePlaying, remoteCommand, useRemotePolling } from "../remote";
import { Art } from "../ui";
import { Motion, slideUp } from "../anim";
import { openPlayer } from "../chrome/player-ui";
// Imported here, in the always-mounted widget, so a reload rejoins its party
import { party, setPartyNavigator } from "../syncplay";
import { usePartyNotices } from "../party/PartyBar";
import { usePresence } from "../presence";
import { reminderDue } from "../settings";

export default function NowPlayingWidget() {
  // Global widgets mount whatever the Integrations toggle says; don't poll
  // (or show) anything while the feature is switched off.
  const enabled = () => isModuleActive("jellyfin", new Set(), disabledFrontendModules());
  return (
    <Show when={enabled()}>
      <MiniPlayer />
    </Show>
  );
}

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

function MiniPlayer() {
  const { t } = useI18n();
  useRemotePolling();
  usePresence();
  useRecapReminder();
  usePartyNotices();
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
  const btn = "p-1 rounded-full text-txt hover:bg-elevated disabled:opacity-40 transition-colors shrink-0";

  return (
    <Motion.div {...slideUp} class="flex w-full items-center gap-2 p-1.5 pr-2 rounded-2xl bg-surface ring-1 ring-rim/40">
      <A href="/jellyfin" title={t("jellyfin.open_player")} class="flex flex-1 items-center gap-2 min-w-0"
        onClick={() => { if (props.local) openPlayer(); }}>
        <Art src={props.s ? imageUrl(props.s, props.item, 96) : null} class="w-10 h-10" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1 text-sm text-txt min-w-0">
            <Show when={party()}>
              <span title={t("jellyfin.party_badge", { name: party()!.name })} class="shrink-0 text-accent-txt"><MdFillGroups size={14} /></span>
            </Show>
            <span class="truncate">{props.item.Name}</span>
          </span>
          <span class="block text-xs text-muted truncate">{props.subtitle}</span>
        </span>
      </A>
      <Show when={props.controllable}>
        <button type="button" class={btn} title={t("jellyfin.previous")} onClick={() => props.onPrev()}>
          <MdFillSkip_previous size={20} />
        </button>
        <button
          type="button"
          onClick={() => props.onToggle()}
          title={props.playing ? t("jellyfin.pause") : t("jellyfin.play")}
          class={`${btn} ${props.loading ? "animate-pulse" : ""}`}
        >
          <Show when={props.playing} fallback={<MdFillPlay_arrow size={24} />}>
            <MdFillPause size={24} />
          </Show>
        </button>
        <button type="button" class={btn} title={t("jellyfin.next")} onClick={() => props.onNext()}
          disabled={!props.hasNext}>
          <MdFillSkip_next size={20} />
        </button>
      </Show>
    </Motion.div>
  );
}
