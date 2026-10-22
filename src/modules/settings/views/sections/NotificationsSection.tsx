import { Show, createSignal, onMount } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchNotificationSettings, saveNotificationSettings } from "../../api/api";
import { useSectionForm } from "../../store/useSectionForm";
import { SaveBar, Group } from "../../store/FormHelpers";
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
import { Input } from "@ui/Field";
import { Toggle } from "@ui/Toggle";
import { Card, CardHeader } from "@ui/Card";

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
              <Toggle name="post_newfriend"     label={t("settings.notif_friend_request")} checked={!!d().post_newfriend} />
              <Toggle name="post_joingroup"     label={t("settings.notif_join_forum")}     checked={!!d().post_joingroup} />
              <Toggle name="post_profilechange" label={t("settings.notif_profile_change")} checked={!!d().post_profilechange} />
            </Group>

            {/* Email notifications */}
            <Group
              icon={<MdOutlineEmail size={18} />}
              title={t("settings.notif_email_title")}
              desc={t("settings.notif_email_desc")}
              columns
            >
              <Toggle name="notify1" label={t("settings.notif_email_conn_req")}       checked={!!d().notify1} />
              <Toggle name="notify2" label={t("settings.notif_email_conn_confirmed")} checked={!!d().notify2} />
              <Toggle name="notify3" label={t("settings.notif_email_wall_post")}      checked={!!d().notify3} />
              <Toggle name="notify4" label={t("settings.notif_email_followup")}       checked={!!d().notify4} />
              <Toggle name="notify5" label={t("settings.notif_email_private")}        checked={!!d().notify5} />
              <Toggle name="notify6" label={t("settings.notif_email_friend_suggest")} checked={!!d().notify6} />
              <Toggle name="notify7" label={t("settings.notif_email_tagged")}         checked={!!d().notify7} />
              <Toggle name="notify8" label={t("settings.notif_email_poked")}          checked={!!d().notify8} />
              <Toggle name="notify9" label={t("settings.notif_email_liked")}          checked={!!d().notify9} />
            </Group>

            {/* Visual notifications */}
            <Group
              icon={<MdOutlineNotifications size={18} />}
              title={t("settings.notif_visual_title")}
              desc={t("settings.notif_visual_desc")}
              columns
            >
              <Toggle name="vnotify1"  label={t("settings.notif_visual_stream")}          checked={!!d().vnotify1} />
              <Toggle name="vnotify2"  label={t("settings.notif_visual_channel")}         checked={!!d().vnotify2} />
              <Toggle name="vnotify3"  label={t("settings.notif_visual_private")}         checked={!!d().vnotify3} />
              <Toggle name="vnotify4"  label={t("settings.notif_visual_events")}          checked={!!d().vnotify4} />
              <Toggle name="vnotify5"  label={t("settings.notif_visual_events_today")}    checked={!!d().vnotify5} />
              <Toggle name="vnotify6"  label={t("settings.notif_visual_birthdays")}       checked={!!d().vnotify6} />
              <Toggle name="vnotify7"  label={t("settings.notif_visual_system")}          checked={!!d().vnotify7} />
              <Toggle name="vnotify8"  label={t("settings.notif_visual_system_info")}     checked={!!d().vnotify8} />
              <Toggle name="vnotify9"  label={t("settings.notif_visual_system_critical")} checked={!!d().vnotify9} />
              <Toggle name="vnotify10" label={t("settings.notif_visual_connections")}     checked={!!d().vnotify10} />
              <Toggle name="vnotify12" label={t("settings.notif_visual_files")}           checked={!!d().vnotify12} />
              <Toggle name="vnotify14" label={t("settings.notif_visual_likes")}           checked={!!d().vnotify14} />
              <Toggle name="vnotify15" label={t("settings.notif_visual_forum")}           checked={!!d().vnotify15} />
              <Show when={d().vnotify11 !== undefined}>
                <Toggle name="vnotify11" label={t("settings.notif_visual_registrations")} checked={!!d().vnotify11} />
              </Show>
              <Show when={d().vnotify13 !== undefined}>
                <Toggle name="vnotify13" label={t("settings.notif_visual_pubstream")}     checked={!!d().vnotify13} />
              </Show>
            </Group>

            {/* Misc */}
            <Group
              icon={<MdOutlineTune size={18} />}
              title={t("settings.notif_other_title")}
              desc={t("settings.notif_other_desc")}
            >
              <Toggle name="always_show_in_notices"    label={t("settings.notif_show_in_notices")}  checked={!!d().always_show_in_notices} />
              <Toggle name="update_notices_per_parent" label={t("settings.notif_mark_thread_read")} checked={!!d().update_notices_per_parent} />
              <Toggle name="invert_notifications_order"  label={t("settings.notif_invert_order")}     checked={!!d().invert_notifications_order} />
              <DesktopNotifyRow />
              <PushNotifyRow />
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span class="min-w-0">
                  <span class="block text-sm text-txt">{t("settings.notif_event_advance_days")}</span>
                  <span class="block text-xs text-muted">{t("settings.notif_event_advance_hint")}</span>
                </span>
                <Input
                  class="w-16 shrink-0 text-center"
                  type="number"
                  name="evdays"
                  min="1"
                  max="30"
                  value={d().evdays}
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
    <Toggle
      label={t("settings.notif_desktop_title")}
      hint={blocked() ? t("settings.notif_desktop_blocked") : t("settings.notif_desktop_hint")}
      checked={on()}
      disabled={!supported || blocked() || busy()}
      onChange={toggle}
    />
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
    <Toggle
      label={t("settings.notif_push_title")}
      hint={blocked() ? t("settings.notif_desktop_blocked") : t("settings.notif_push_hint")}
      checked={subscribed()}
      disabled={!supported || blocked() || busy()}
      onChange={toggle}
    />
  );
}

function Skeleton() {
  return (
    <div class="space-y-5 animate-pulse">
      {[...Array(3)].map(() => (
        <Card>
          <CardHeader class="flex items-center gap-3">
            <div class="h-8 w-8 rounded-lg bg-elevated" />
            <div class="space-y-1.5">
              <div class="h-3.5 w-36 rounded bg-elevated" />
              <div class="h-3 w-52 rounded bg-elevated" />
            </div>
          </CardHeader>
          <div class="px-4 py-2 space-y-3">
            {[...Array(3)].map(() => (
              <div class="flex items-center justify-between">
                <div class="h-3.5 w-48 rounded bg-elevated" />
                <div class="h-6 w-11 rounded-full bg-elevated" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
