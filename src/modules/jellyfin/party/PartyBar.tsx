// Watch / listen together: start a party around what's playing, invite
// Hubzilla connections by DM, see who's in, chat in the invite thread, leave.
import { For, Show, createEffect, createSignal, lazy, on, Suspense } from "solid-js";
import { MdFillGroups, MdFillPerson_add, MdFillChat, MdFillLogout } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { useAuth, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { fetchMessages } from "@utsukta/spa-core/lib/message-store";
import DMComposer from "@/shared/editor/composers/DMComposer";
import type { JellyfinSession } from "../api";
import {
  party, partyThread, partyNotice, partyCode, setPartyThread, startParty, leaveParty,
} from "../syncplay";
import { Motion, Presence, slideDown } from "../anim";
import { ghostPill } from "../ui";

const DmThread = lazy(() => import("@/modules/messenger/DmPane").then((m) => ({ default: m.DmThread })));

/** Toasts for party events — mount once (the global mini-player does). */
export function usePartyNotices() {
  const { t } = useI18n();
  createEffect(on(partyNotice, (n) => {
    if (!n) return;
    switch (n.type) {
      case "joined": return toast.info(t("jellyfin.party_user_joined", { name: n.name }));
      case "left": return toast.info(t("jellyfin.party_user_left", { name: n.name }));
      case "ended": return toast.info(t("jellyfin.party_ended"));
      case "not-found": return toast.error(t("jellyfin.party_not_found"));
      case "denied": return toast.error(t("jellyfin.party_denied"));
      case "failed": return toast.error(t("jellyfin.party_request_failed"));
    }
  }, { defer: true }));
}

/** The invite: a relative link, so it opens the reader's *own* hub's player. */
function inviteText(t: ReturnType<typeof useI18n>["t"], s: JellyfinSession, gid: string, name: string): string {
  const href = `/jellyfin?${new URLSearchParams({ party: gid, srv: s.id, jf: s.server })}`;
  const label = t("jellyfin.party_join_link");
  const link = isFeatureEnabled("markdown") ? `[${label}](${href})` : `[url=${href}]${label}[/url]`;
  return [
    t("jellyfin.party_invite_line", { name }),
    "",
    link,
    "",
    t("jellyfin.party_invite_account", { server: s.server }),
  ].join("\n");
}

export default function PartyBar(props: {
  /** "start": only the start button (nothing once in a party). "panel": only the
   *  running party. Default: whichever applies. */
  mode?: "start" | "panel";
  s: JellyfinSession | null;
  kind: "audio" | "video";
  /** What's playing, for the default party name. */
  title: string;
  /** What to start the party with. */
  media: () => { ids: string[]; index: number; startSec: number };
}) {
  const { t } = useI18n();
  const auth = useAuth();
  const [starting, setStarting] = createSignal(false);
  const [inviting, setInviting] = createSignal(false);
  const [chatOpen, setChatOpen] = createSignal(false);

  const start = async () => {
    const s = props.s;
    const m = props.media();
    if (!s || !m.ids.length || starting()) return;
    setStarting(true);
    try {
      await startParty(s, t("jellyfin.party_default_name", { name: s.userName, title: props.title }), m.ids, m.index, m.startSec);
      setInviting(true);
    } catch {
      toast.error(t("jellyfin.party_request_failed"));
    } finally {
      setStarting(false);
    }
  };

  // An invitee's browser finds the invite thread by the party code in its subject
  createEffect(on(() => party()?.id, (gid) => {
    if (!gid || partyThread()) return;
    const code = `#${partyCode(gid)}`;
    fetchMessages({ offset: 0, type: "direct", file: "", search: "" })
      .then((page) => {
        const hit = page.entries.find((e) => e.title?.includes(code));
        if (hit && party()?.id === gid) setPartyThread(hit.b64mid);
      })
      .catch(() => undefined);
  }));

  const btn = `${ghostPill} !h-9 !px-3`;

  return (
    <>
      <Show when={party() && props.mode !== "start"} fallback={
        <Show when={!party() && props.mode !== "panel" && props.s && auth()?.isLocal}>
          <button type="button" disabled={starting()} onClick={() => void start()} class={ghostPill}>
            <MdFillGroups size={16} />
            {starting() ? t("jellyfin.party_starting") : props.kind === "video" ? t("jellyfin.party_watch") : t("jellyfin.party_listen")}
          </button>
        </Show>
      }>
        {(_on) => { const p = () => party()!; return (
          <section class="basis-full space-y-3 p-4 rounded-2xl bg-elevated/40">
            <div class="flex flex-wrap items-center gap-2">
              <MdFillGroups size={18} class="text-accent-txt shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-txt truncate">{p().name}</p>
                <p class="text-xs text-muted">
                  {p().state === "Waiting" ? t("jellyfin.party_waiting")
                    : p().state === "Playing" ? t("jellyfin.party_playing")
                    : t("jellyfin.party_paused")}
                  {" · "}{t("jellyfin.party_people", { n: String(p().participants.length) })}
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button type="button" class={btn} onClick={() => setInviting(true)}>
                  <MdFillPerson_add size={16} /> {t("jellyfin.party_invite")}
                </button>
                <button type="button" aria-pressed={chatOpen()} onClick={() => setChatOpen(!chatOpen())}
                  class={`${btn} ${chatOpen() ? "!text-accent-txt bg-elevated/70" : ""}`}>
                  <MdFillChat size={16} /> {t("jellyfin.party_chat")}
                </button>
                <button type="button" class={btn} onClick={() => { setChatOpen(false); leaveParty(); }}>
                  <MdFillLogout size={16} /> {t("jellyfin.party_leave")}
                </button>
              </div>
            </div>
            <div class="flex flex-wrap gap-1">
              <For each={p().participants}>
                {(name) => <span class="px-2.5 py-0.5 rounded-full bg-surface/80 text-xs text-txt">{name}</span>}
              </For>
            </div>
            <Presence>
              <Show when={chatOpen()}>
                <Motion.div {...slideDown} class="flex flex-col h-96 min-h-0 rounded-xl bg-surface/80 overflow-hidden">
                  <Show when={partyThread()} keyed fallback={
                    <p class="m-auto p-4 text-sm text-muted text-center">{t("jellyfin.party_chat_empty")}</p>
                  }>
                    {(uuid) => (
                      <Suspense fallback={<p class="m-auto text-sm text-muted animate-pulse">{t("jellyfin.loading")}</p>}>
                        <DmThread uuid={uuid} unseen={false} onGone={() => setChatOpen(false)} />
                      </Suspense>
                    )}
                  </Show>
                </Motion.div>
              </Show>
            </Presence>
          </section>
        ); }}
      </Show>

      <Show when={inviting() && party() && props.s}>
        <DMComposer
          open={true}
          onClose={() => setInviting(false)}
          profileUid={auth()?.uid ?? 0}
          scopeKey={`jellyfin:party:${party()!.id}`}
          initialTitle={`${props.kind === "video" ? "🎬" : "🎶"} ${t("jellyfin.party_invite_title", { name: party()!.name })} · #${partyCode(party()!.id)}`}
          initialBody={inviteText(t, props.s!, party()!.id, party()!.name)}
          onSent={(_iid, uuid) => { if (uuid) setPartyThread(uuid); setChatOpen(true); }}
        />
      </Show>
    </>
  );
}
