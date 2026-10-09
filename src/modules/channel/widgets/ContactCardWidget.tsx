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
      <div class="bg-surface border border-rim rounded-xl overflow-hidden">
        {/* Cover + avatar */}
        <div class="relative bg-gradient-to-br from-accent to-accent-txt" style="aspect-ratio: 3 / 1;">
          <Show when={profile()!.channel_cover}>
            <img src={profile()!.channel_cover} alt="" class="absolute inset-0 w-full h-full object-cover" />
          </Show>
          <div class="absolute -bottom-7 left-4">
            <img
              src={profile()!.channel_photo_l}
              alt={profile()!.channel_name}
              class="w-14 h-14 rounded-full ring-4 ring-surface object-cover bg-overlay"
            />
          </div>
        </div>

        <div class="pt-9 px-4 pb-4">
          <p class="text-sm font-semibold text-txt truncate">{profile()!.channel_name}</p>
          <p class="text-xs text-muted truncate">@{profile()!.xchan_addr || profile()!.channel_address}</p>
          <Show when={profile()!.pdesc}>
            <p class="text-xs text-muted mt-0.5 italic">{profile()!.pdesc}</p>
          </Show>

          <Show when={profile()!.is_remote}>
            <span class="inline-flex items-center gap-1 mt-2 px-2 py-0.5 text-[0.625rem] rounded-full bg-elevated text-muted border border-rim">
              <MdFillPublic size={10} /> {t("channel.remote_channel")}
            </span>
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
                  <span class="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-elevated text-muted">
                    {kw}
                  </span>
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
                <button
                  onClick={handleConnect}
                  disabled={connecting()}
                  class="text-[0.625rem] px-2.5 py-1 rounded-full bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                  {connecting() ? t("directory.connecting") : t("ui.connect")}
                </button>
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
      </div>
    </Show>
  );
}
