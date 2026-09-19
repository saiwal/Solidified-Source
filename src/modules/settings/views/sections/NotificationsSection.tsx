import { Show, createSignal, onMount } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchNotificationSettings, saveNotificationSettings } from "../../api/api";
import { useSectionForm } from "../../store/useSectionForm";
import { SaveBar, Group, SwitchRow } from "../../store/FormHelpers";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  MdOutlineCampaign,
  MdOutlineEmail,
  MdOutlineNotifications,
  MdOutlineTune,
} from "solid-icons/md";
import {
  desktopNotifyEnabled,
  desktopNotifyPermission,
  desktopNotifySupported,
  enableDesktopNotify,
  disableDesktopNotify,
} from "@utsukta/spa-core/lib/desktopNotify";
import {
  isPushSupported,
  getCurrentPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@utsukta/spa-core/lib/webPush";

const NOTIFY_FIELDS = [
  "notify1","notify2","notify3","notify4","notify5",
  "notify6","notify7","notify8","notify9",
  "vnotify1","vnotify2","vnotify3","vnotify4","vnotify5",
  "vnotify6","vnotify7","vnotify8","vnotify9","vnotify10",
  "vnotify11","vnotify12","vnotify13","vnotify14","vnotify15",
  "post_newfriend","post_joingroup","post_profilechange",
  "always_show_in_notices","update_notices_per_parent",
  "invert_notifications_order",
] as const;

export default function NotificationsSection() {
  const { t } = useI18n();
  const { data, saving, handleSubmit } = useSectionForm({
    section: "notifications",
    fetcher: fetchNotificationSettings,
    saver: saveNotificationSettings,
    numericFields: ["evdays", ...NOTIFY_FIELDS],
    checkboxFields: [...NOTIFY_FIELDS],
  });

  return (
    <SubPageContent title={t("settings.title_notifications")} description={t("settings.desc_notifications")}>
      <Show when={data()} fallback={<Skeleton />}>
        {(d) => (
          <form onSubmit={handleSubmit} class="space-y-5">

            {/* Activity auto-posts */}
            <Group
              icon={<MdOutlineCampaign size={18} />}
              title={t("settings.notif_autopost_title")}
              desc={t("settings.notif_autopost_desc")}
            >
              <SwitchRow name="post_newfriend"     label={t("settings.notif_friend_request")} checked={!!d().post_newfriend} />
              <SwitchRow name="post_joingroup"     label={t("settings.notif_join_forum")}     checked={!!d().post_joingroup} />
              <SwitchRow name="post_profilechange" label={t("settings.notif_profile_change")} checked={!!d().post_profilechange} />
            </Group>

            {/* Email notifications */}
            <Group
              icon={<MdOutlineEmail size={18} />}
              title={t("settings.notif_email_title")}
              desc={t("settings.notif_email_desc")}
              columns
            >
              <SwitchRow name="notify1" label={t("settings.notif_email_conn_req")}       checked={!!d().notify1} />
              <SwitchRow name="notify2" label={t("settings.notif_email_conn_confirmed")} checked={!!d().notify2} />
              <SwitchRow name="notify3" label={t("settings.notif_email_wall_post")}      checked={!!d().notify3} />
              <SwitchRow name="notify4" label={t("settings.notif_email_followup")}       checked={!!d().notify4} />
              <SwitchRow name="notify5" label={t("settings.notif_email_private")}        checked={!!d().notify5} />
              <SwitchRow name="notify6" label={t("settings.notif_email_friend_suggest")} checked={!!d().notify6} />
              <SwitchRow name="notify7" label={t("settings.notif_email_tagged")}         checked={!!d().notify7} />
              <SwitchRow name="notify8" label={t("settings.notif_email_poked")}          checked={!!d().notify8} />
              <SwitchRow name="notify9" label={t("settings.notif_email_liked")}          checked={!!d().notify9} />
            </Group>

            {/* Visual notifications */}
            <Group
              icon={<MdOutlineNotifications size={18} />}
              title={t("settings.notif_visual_title")}
              desc={t("settings.notif_visual_desc")}
              columns
            >
              <SwitchRow name="vnotify1"  label={t("settings.notif_visual_stream")}          checked={!!d().vnotify1} />
              <SwitchRow name="vnotify2"  label={t("settings.notif_visual_channel")}         checked={!!d().vnotify2} />
              <SwitchRow name="vnotify3"  label={t("settings.notif_visual_private")}         checked={!!d().vnotify3} />
              <SwitchRow name="vnotify4"  label={t("settings.notif_visual_events")}          checked={!!d().vnotify4} />
              <SwitchRow name="vnotify5"  label={t("settings.notif_visual_events_today")}    checked={!!d().vnotify5} />
              <SwitchRow name="vnotify6"  label={t("settings.notif_visual_birthdays")}       checked={!!d().vnotify6} />
              <SwitchRow name="vnotify7"  label={t("settings.notif_visual_system")}          checked={!!d().vnotify7} />
              <SwitchRow name="vnotify8"  label={t("settings.notif_visual_system_info")}     checked={!!d().vnotify8} />
              <SwitchRow name="vnotify9"  label={t("settings.notif_visual_system_critical")} checked={!!d().vnotify9} />
              <SwitchRow name="vnotify10" label={t("settings.notif_visual_connections")}     checked={!!d().vnotify10} />
              <SwitchRow name="vnotify12" label={t("settings.notif_visual_files")}           checked={!!d().vnotify12} />
              <SwitchRow name="vnotify14" label={t("settings.notif_visual_likes")}           checked={!!d().vnotify14} />
              <SwitchRow name="vnotify15" label={t("settings.notif_visual_forum")}           checked={!!d().vnotify15} />
              <Show when={d().vnotify11 !== undefined}>
                <SwitchRow name="vnotify11" label={t("settings.notif_visual_registrations")} checked={!!d().vnotify11} />
              </Show>
              <Show when={d().vnotify13 !== undefined}>
                <SwitchRow name="vnotify13" label={t("settings.notif_visual_pubstream")}     checked={!!d().vnotify13} />
              </Show>
            </Group>

            {/* Misc */}
            <Group
              icon={<MdOutlineTune size={18} />}
              title={t("settings.notif_other_title")}
              desc={t("settings.notif_other_desc")}
            >
              <SwitchRow name="always_show_in_notices"    label={t("settings.notif_show_in_notices")}  checked={!!d().always_show_in_notices} />
              <SwitchRow name="update_notices_per_parent" label={t("settings.notif_mark_thread_read")} checked={!!d().update_notices_per_parent} />
              <SwitchRow name="invert_notifications_order"  label={t("settings.notif_invert_order")}     checked={!!d().invert_notifications_order} />
              <DesktopNotifyRow />
              <PushNotifyRow />
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span class="min-w-0">
                  <span class="block text-sm text-txt">{t("settings.notif_event_advance_days")}</span>
                  <span class="block text-xs text-muted">{t("settings.notif_event_advance_hint")}</span>
                </span>
                <input
                  type="number"
                  name="evdays"
                  min="1"
                  max="30"
                  value={d().evdays}
                  class="w-16 shrink-0 px-2 py-1.5 rounded-lg border border-rim bg-base text-txt
                         text-sm text-center hover:border-rim-strong focus:outline-none
                         focus:border-rim-strong transition-colors"
                />
              </div>
            </Group>

            <SaveBar saving={saving()} />

          </form>
        )}
      </Show>
    </SubPageContent>
  );
}

function DesktopNotifyRow() {
  const { t } = useI18n();
  const [busy, setBusy] = createSignal(false);
  const supported = desktopNotifySupported();
  const blocked = () => supported && desktopNotifyPermission() === "denied";
  const on = () => desktopNotifyEnabled() && desktopNotifyPermission() === "granted";

  const toggle = async () => {
    if (busy() || blocked() || !supported) return;
    setBusy(true);
    try {
      if (on()) disableDesktopNotify();
      else await enableDesktopNotify();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex items-center justify-between gap-4 py-2.5">
      <span class="min-w-0">
        <span class="block text-sm text-txt">{t("settings.notif_desktop_title")}</span>
        <span class="block text-xs text-muted">
          {blocked() ? t("settings.notif_desktop_blocked") : t("settings.notif_desktop_hint")}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on()}
        onClick={toggle}
        disabled={!supported || blocked() || busy()}
        class={
          "appearance-none relative h-6 w-11 shrink-0 cursor-pointer rounded-full p-0 " +
          "border transition-colors disabled:opacity-50 disabled:cursor-not-allowed " +
          "after:absolute after:top-1/2 after:left-1 after:-translate-y-1/2 " +
          "after:h-4 after:w-4 after:rounded-full " +
          "after:transition-transform after:duration-150 motion-reduce:after:transition-none " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
          "focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
          (on()
            ? "bg-accent border-accent after:translate-x-5 after:bg-accent-fg"
            : "bg-elevated border-rim after:bg-muted")
        }
      />
    </div>
  );
}

function PushNotifyRow() {
  const { t } = useI18n();
  const [busy, setBusy] = createSignal(false);
  const [subscribed, setSubscribed] = createSignal(false);
  const supported = isPushSupported();
  const blocked = () => supported && desktopNotifyPermission() === "denied";

  onMount(async () => {
    if (!supported) return;
    setSubscribed(!!(await getCurrentPushSubscription()));
  });

  const toggle = async () => {
    if (busy() || blocked() || !supported) return;
    setBusy(true);
    try {
      if (subscribed()) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        let perm = Notification.permission;
        if (perm === "default") perm = await Notification.requestPermission();
        if (perm !== "granted") return;
        setSubscribed(await subscribeToPush());
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex items-center justify-between gap-4 py-2.5">
      <span class="min-w-0">
        <span class="block text-sm text-txt">{t("settings.notif_push_title")}</span>
        <span class="block text-xs text-muted">
          {blocked() ? t("settings.notif_desktop_blocked") : t("settings.notif_push_hint")}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={subscribed()}
        onClick={toggle}
        disabled={!supported || blocked() || busy()}
        class={
          "appearance-none relative h-6 w-11 shrink-0 cursor-pointer rounded-full p-0 " +
          "border transition-colors disabled:opacity-50 disabled:cursor-not-allowed " +
          "after:absolute after:top-1/2 after:left-1 after:-translate-y-1/2 " +
          "after:h-4 after:w-4 after:rounded-full " +
          "after:transition-transform after:duration-150 motion-reduce:after:transition-none " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 " +
          "focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
          (subscribed()
            ? "bg-accent border-accent after:translate-x-5 after:bg-accent-fg"
            : "bg-elevated border-rim after:bg-muted")
        }
      />
    </div>
  );
}

function Skeleton() {
  return (
    <div class="space-y-5 animate-pulse">
      {[...Array(3)].map(() => (
        <div class="rounded-xl border border-rim bg-surface">
          <div class="flex items-center gap-3 px-4 py-3 border-b border-rim">
            <div class="h-8 w-8 rounded-lg bg-elevated" />
            <div class="space-y-1.5">
              <div class="h-3.5 w-36 rounded bg-elevated" />
              <div class="h-3 w-52 rounded bg-elevated" />
            </div>
          </div>
          <div class="px-4 py-2 space-y-3">
            {[...Array(3)].map(() => (
              <div class="flex items-center justify-between">
                <div class="h-3.5 w-48 rounded bg-elevated" />
                <div class="h-6 w-11 rounded-full bg-elevated" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
