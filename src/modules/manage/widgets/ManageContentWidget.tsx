import { type Component, For, Show } from "solid-js";
import {
  useManageData,
  useActionState,
  doSwitchChannel,
  doSetDefault,
} from "../store";
import type { ManagedChannel, ManagedDelegate } from "../api";
import { buildDelegateSwitchUrl } from "../api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button, IconButton } from "@ui/Button";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";

// ── ChannelCard ───────────────────────────────────────────────────────────────

const ChannelCard: Component<{
  channel: ManagedChannel;
  onSwitch: (id: number) => void;
  onSetDefault: (id: number) => void;
  disabled: boolean;
}> = (props) => {
  const { t } = useI18n();
  const borderClass = () =>
    props.channel.is_current
      ? "border-blue-500 dark:border-blue-400"
      : "border-rim";

  return (
    <div
      class={`flex items-center gap-3 p-3 rounded-lg border bg-surface ${borderClass()}`}
    >
      {/* Avatar */}
      <div class="relative shrink-0">
        <Avatar src={props.channel.photo} name={props.channel.channel_name} size={10} />
        <Show when={props.channel.is_current}>
          <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-accent border-2 border-surface" />
        </Show>
      </div>

      {/* Info */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-sm truncate">
            {props.channel.channel_name}
          </span>
          <Show when={props.channel.is_current}>
            <Badge tone="accent">
              {t("manage.current_badge")}
            </Badge>
          </Show>
          <Show when={props.channel.is_default}>
            <Badge>
              {t("manage.default_badge")}
            </Badge>
          </Show>
          <Show when={props.channel.intros > 0}>
            <Badge tone="warning">
              {props.channel.intros} {t("manage.new_badge")}
            </Badge>
          </Show>
        </div>
        <p class="text-xs text-muted truncate">
          @{props.channel.channel_address}
        </p>
      </div>

      {/* Actions */}
      <div class="flex items-center gap-1 shrink-0">
        <Show when={!props.channel.is_default}>
          <IconButton
            label={t("manage.make_default")}
            size="sm"
            disabled={props.disabled}
            onClick={() => props.onSetDefault(props.channel.channel_id)}
          >
            ☆
          </IconButton>
        </Show>
        <Show when={!props.channel.is_current}>
          <Button
            size="sm"
            onClick={() => props.onSwitch(props.channel.channel_id)}
            disabled={props.disabled}
          >
            {t("manage.switch")}
          </Button>
        </Show>
      </div>
    </div>
  );
};

// ── DelegateCard ──────────────────────────────────────────────────────────────

const DelegateCard: Component<{ delegate: ManagedDelegate }> = (props) => {
  const { t } = useI18n();
  // Computed here rather than stored in API response
  const switchUrl = () => buildDelegateSwitchUrl(props.delegate.url, props.delegate.address);

  return (
	<a
      href={switchUrl()}
      class="flex items-center gap-3 p-3 rounded-lg border border-rim bg-surface
             hover:border-rim-strong transition-colors"
    >
      <Avatar src={props.delegate.photo} name={props.delegate.name} size={10} />
      <div class="flex-1 min-w-0">
        <p class="font-medium text-sm truncate">{props.delegate.name}</p>
        <p class="text-xs text-muted truncate">
          {props.delegate.address}
        </p>
      </div>
      <span class="text-xs text-muted shrink-0">{t("manage.delegate_arrow")}</span>
    </a>
  );
};

// ── Skeletons ─────────────────────────────────────────────────────────────────

const ChannelSkeleton: Component = () => (
  <Card class="flex items-center gap-3 p-3">
    <div class="w-10 h-10 rounded-full bg-elevated animate-pulse shrink-0" />
    <div class="flex-1 space-y-2">
      <div class="h-3 w-32 rounded bg-elevated animate-pulse" />
      <div class="h-2.5 w-24 rounded bg-elevated animate-pulse" />
    </div>
  </Card>
);

// ── ManageContentWidget ─────────────────────────────────────────────────────

const ManageContentWidget: Component = () => {
  const { t } = useI18n();
  const data = useManageData();
  const actionState = useActionState();

  const isPending = () => actionState().status === "pending";

  const usageMessage = () => {
    const d = data();
    if (!d || d.limit === null) return null;
    return `${d.total_channels} ${t("manage.channels_of")} ${d.limit} ${t("manage.channels_used")}`;
  };

  const handleSwitch = async (channelId: number) => {
    const redirectTo = await doSwitchChannel(channelId);
    if (redirectTo) window.location.href = redirectTo;
  };

  const handleSetDefault = (channelId: number) => doSetDefault(channelId);

  return (
    <div class="max-w-lg mx-auto space-y-6">

      {/* Loading skeletons */}
      <Show when={data.loading}>
        <div class="space-y-2">
          <For each={[1, 2, 3]}>{() => <ChannelSkeleton />}</For>
        </div>
      </Show>

      {/* Channel list */}
      <Show when={!data.loading && data()}>
        <div class="space-y-2">
          <For each={data()!.channels}>
            {(channel) => (
              <ChannelCard
                channel={channel}
                onSwitch={handleSwitch}
                onSetDefault={handleSetDefault}
                disabled={isPending()}
              />
            )}
          </For>
        </div>

        {/* Usage */}
        <Show when={usageMessage()}>
          <p class="text-xs text-muted text-right">
            {usageMessage()}
          </p>
        </Show>

        {/* Delegates */}
        <Show when={(data()?.delegates.length ?? 0) > 0}>
          <div class="space-y-2">
            <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
              {t("manage.delegated")}
            </h2>
            <For each={data()!.delegates}>
              {(delegate) => <DelegateCard delegate={delegate} />}
            </For>
          </div>
        </Show>
      </Show>

    </div>
  );
};

export default ManageContentWidget;
