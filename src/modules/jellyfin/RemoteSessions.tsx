// What the user's other Jellyfin devices are playing — shown in the header's
// devices popover. Control where the device accepts it, take it over here,
// or share it.
import { For, Show } from "solid-js";
import { MdFillPlay_arrow, MdFillPause, MdFillSkip_next, MdFillSkip_previous, MdOutlinePhonelink } from "solid-icons/md";
import { toast } from "@utsukta/spa-core/store/toast";
import { useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { imageUrl, ticksToSeconds } from "./api";
import { sessionFor, servers } from "./store";
import { remotePlaying, remotePosition, remoteCommand, transferHere, type RemoteSession } from "./remote";
import { Art, iconBtn } from "./ui";
import ShareButton from "./share";

export default function DeviceList(props: { onAction?: () => void }) {
  const { t } = useI18n();
  return (
    <Show when={remotePlaying().length} fallback={<p class="px-3 py-6 text-sm text-muted text-center">{t("jellyfin.no_devices")}</p>}>
      <ul class="space-y-1">
        {/* Keyed by session id: each poll builds fresh objects, and keying by
            object would remount every row — closing an open Share composer. */}
        <For each={remotePlaying().map((r) => r.id)}>
          {(id) => (
            <Show when={remotePlaying().find((r) => r.id === id)}>
              {(r) => <DeviceRow r={r()} multiServer={servers().length > 1} onAction={props.onAction} />}
            </Show>
          )}
        </For>
      </ul>
    </Show>
  );
}

function DeviceRow(props: { r: RemoteSession; multiServer: boolean; onAction?: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const watch = (id: string, at: number) => navigate(`/jellyfin?watch=${encodeURIComponent(id)}&t=${at}`);
  const s = () => sessionFor(props.r.srv);
  const item = () => props.r.item!;
  const dur = () => ticksToSeconds(item().RunTimeTicks);
  const pct = () => (dur() ? Math.min(100, (remotePosition(props.r) / dur()) * 100) : 0);

  return (
    <li class="p-2 rounded-xl hover:bg-elevated/50 transition-colors">
      <div class="flex items-center gap-3">
        <Art src={s() ? imageUrl(s()!, item(), 96) : null} class="w-11 h-11" />
        <div class="min-w-0 flex-1">
          <p class="text-sm text-txt truncate">{item().Name}</p>
          <p class="text-xs text-muted truncate">
            {props.r.device}
            <Show when={props.multiServer}>, {props.r.serverName}</Show>
            <Show when={props.r.paused}> — {t("jellyfin.paused")}</Show>
          </p>
        </div>
      </div>
      <div class="mt-2 h-0.5 rounded-full bg-elevated overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct())} aria-valuemin={0} aria-valuemax={100}>
        <div class="h-full bg-accent/70 transition-[width] duration-1000 ease-linear" style={{ width: `${pct()}%` }} />
      </div>
      <div class="mt-1 flex items-center justify-between">
        <div class="flex items-center">
          <Show when={props.r.controllable}>
            <button type="button" class={iconBtn} title={t("jellyfin.previous")} onClick={() => void remoteCommand(props.r, "PreviousTrack")}>
              <MdFillSkip_previous size={18} />
            </button>
            <button type="button" class={iconBtn} title={props.r.paused ? t("jellyfin.play") : t("jellyfin.pause")}
              onClick={() => void remoteCommand(props.r, "PlayPause")}>
              <Show when={!props.r.paused} fallback={<MdFillPlay_arrow size={20} />}><MdFillPause size={20} /></Show>
            </button>
            <button type="button" class={iconBtn} title={t("jellyfin.next")} onClick={() => void remoteCommand(props.r, "NextTrack")}>
              <MdFillSkip_next size={18} />
            </button>
          </Show>
        </div>
        <div class="flex items-center">
          <button type="button" class={iconBtn} title={t("jellyfin.transfer_here_title", { device: props.r.device })}
            aria-label={t("jellyfin.transfer_here")}
            onClick={() => {
              props.onAction?.();
              transferHere(props.r, watch).catch(() => toast.error(t("jellyfin.err_load")));
            }}>
            <MdOutlinePhonelink size={18} />
          </button>
          <ShareButton session={s()} item={item()} icon />
        </div>
      </div>
    </li>
  );
}
