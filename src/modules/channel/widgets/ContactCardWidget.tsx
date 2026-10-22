// Mini profile-style summary of the current page's channel, reusing the
// existing GET /spa/profile/:nick endpoint (same data ChannelView's profile
// header uses) — no widget-specific backend needed.

import { Show, For, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { connectToChannel } from "@/modules/directory/connections/api";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillLocation_on, MdFillPublic } from "solid-icons/md";
import { fetchProfile } from "../api";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";


export default function ContactCardWidget() {
  const nick = usePageNick();
  const viewerRole = useViewerRole();
  const { t } = useI18n();

  const [data, { refetch }] = createQueryResource("contact-card", () => nick(), fetchProfile);

  const profile = () => data();

  const [connecting, setConnecting] = createSignal(false);

  async function handleConnect() {
    const addr = profile()?.xchan_addr;
    if (!addr) return;
    setConnecting(true);
    try {
      await connectToChannel(addr);
      toast.success(t("directory.connected"));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Show when={!data.loading && profile()}>
      <Card class="overflow-hidden">
        {/* Cover + avatar */}
        <div class="relative bg-gradient-to-br from-accent to-accent-txt" style="aspect-ratio: 3 / 1;">
          <Show when={profile()!.channel_cover}>
            <img src={profile()!.channel_cover} alt="" class="absolute inset-0 w-full h-full object-cover" />
          </Show>
          <div class="absolute -bottom-7 left-4">
            <Avatar src={profile()!.channel_photo_l} name={profile()!.channel_name} size={14} class="ring-4 ring-surface" />
          </div>
        </div>

        <div class="pt-9 px-4 pb-4">
          <p class="text-sm font-semibold text-txt truncate">{profile()!.channel_name}</p>
          <p class="text-xs text-muted truncate">@{profile()!.xchan_addr || profile()!.channel_address}</p>
          <Show when={profile()!.pdesc}>
            <p class="text-xs text-muted mt-0.5 italic">{profile()!.pdesc}</p>
          </Show>

          <Show when={profile()!.is_remote}>
            <Badge size="sm" class="mt-2">
              <MdFillPublic size={10} /> {t("channel.remote_channel")}
            </Badge>
          </Show>

          <Show when={profile()!.location || profile()!.gender || profile()!.marital}>
            <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted mt-3">
              <Show when={profile()!.location}>
                <span class="flex items-center gap-1">
                  <MdFillLocation_on size={13} /> {profile()!.location}
                </span>
              </Show>
              <Show when={profile()!.gender}>
                <span>{profile()!.gender}</span>
              </Show>
              <Show when={profile()!.marital}>
                <span>{profile()!.marital}</span>
              </Show>
            </div>
          </Show>

          <Show when={profile()!.homepage}>
            <a
              href={profile()!.homepage}
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1 text-xs text-accent hover:underline mt-2 truncate"
            >
              <MdFillPublic size={12} />
              {profile()!.homepage.replace(/^https?:\/\//, "")}
            </a>
          </Show>

          <Show when={profile()!.keywords.length > 0}>
            <div class="flex flex-wrap gap-1 mt-3">
              <For each={profile()!.keywords.slice(0, 8)}>
                {(kw) => (
                  <Badge size="sm">
                    {kw}
                  </Badge>
                )}
              </For>
            </div>
          </Show>

          <Show
            when={
              (viewerRole() !== "owner" && viewerRole() !== "anonymous" && !profile()!.is_connected && profile()!.connect_url) ||
              !profile()!.is_remote
            }
          >
            <div class="mt-3 pt-3 border-t border-rim flex items-center gap-2">
              <Show when={viewerRole() !== "owner" && viewerRole() !== "anonymous" && !profile()!.is_connected && profile()!.connect_url}>
                <Button size="sm" onClick={handleConnect} disabled={connecting()}>
                  {connecting() ? t("directory.connecting") : t("ui.connect")}
                </Button>
              </Show>
              <Show when={!profile()!.is_remote}>
                <A
                  href={`/profile/${profile()!.channel_address}`}
                  class="text-[0.625rem] px-2.5 py-1 rounded-full bg-elevated text-muted border border-rim hover:text-accent hover:border-accent transition-colors"
                >
                  {t("channel.more_details")}
                </A>
              </Show>
            </div>
          </Show>
        </div>
      </Card>
    </Show>
  );
}
