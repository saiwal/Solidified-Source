import { createSignal, createEffect, Show, onMount, onCleanup } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { authenticate, normaliseServer, JellyfinError } from "../api";
import Modal from "@/shared/views/Modal";
import PlayerBar from "../player/PlayerBar";
import FullPlayer from "../player/FullPlayer";
import { Browser } from "../library/views";
import SettingsPanel, { useRecapComposer } from "../SettingsPanel";
import { settingsOpen, setSettingsOpen } from "../settings";
import { videoActive } from "../video/state";
import { Motion, fade, pop } from "../anim";
import {
  session, servers, deviceId, isConnected, adding, setAdding, prefillUrl, addServer,
  current, toggle, next, prev, seek, position, muted, setMuted, startAddServer, sessionFor, setActive,
} from "../store";
import { joinParty, party } from "../syncplay";
import { primaryPill, ghostPill } from "../ui";

/**
 * Player shortcuts while /jellyfin is open: Space play/pause, ←/→ seek 10s,
 * Shift+←/→ previous/next, M mute. Ignored while typing in a field.
 */
function usePlayerShortcuts() {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || !current() || videoActive()) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName))) return;
    if (e.key === " ") toggle();
    else if (e.key === "ArrowRight") e.shiftKey ? next() : seek(position() + 10);
    else if (e.key === "ArrowLeft") e.shiftKey ? prev() : seek(position() - 10);
    else if (e.key === "m" || e.key === "M") setMuted(!muted());
    else return;
    e.preventDefault();
  };
  onMount(() => document.addEventListener("keydown", onKey));
  onCleanup(() => document.removeEventListener("keydown", onKey));
}

/**
 * ?party=<group>&srv=<server id>&jf=<server url> — an invite link. Joins at
 * once when signed in to that server; otherwise opens the sign-in form for
 * it and joins right after.
 */
const [pendingJoin, setPendingJoin] = createSignal<{ gid: string; srv: string; jf: string } | null>(null);
export { pendingJoin };

function usePartyJoin() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  createEffect(() => {
    const gid = String(params.party ?? "");
    if (!gid) return;
    setPendingJoin({ gid, srv: String(params.srv ?? ""), jf: String(params.jf ?? "") });
    setParams({ party: undefined, srv: undefined, jf: undefined }, { replace: true });
  });
  createEffect(() => {
    const p = pendingJoin();
    if (!p) return;
    // Same server: by ServerId, or by address (a session migrated from the
    // single-server format is keyed by its URL)
    const s = sessionFor(p.srv) ?? servers().find((x) => x.server === p.jf.replace(/\/+$/, "")) ?? null;
    if (!s) {
      if (!adding()) startAddServer(p.jf);
      return;
    }
    setPendingJoin(null);
    if (party()?.id === p.gid) return;
    setActive(s.id);
    joinParty(s, p.gid).catch(() => toast.error(t("jellyfin.party_request_failed")));
  });
}

export default function JellyfinContentWidget() {
  const { t } = useI18n();
  usePlayerShortcuts();
  usePartyJoin();
  const recap = useRecapComposer();
  return (
    // Tall enough that the player bar rests at the foot of the window even
    // when a page is short; it is sticky within this column.
    <div class="max-w-5xl mx-auto min-h-[calc(100dvh-13rem)] flex flex-col">
      <Show when={isConnected() && !adding()} fallback={<Motion.div {...fade}><ConnectForm /></Motion.div>}>
        <div class="flex-1">
          <Browser s={session()!} />
        </div>
        <PlayerBar />
        <FullPlayer />
        <Show when={settingsOpen()}>
          <Modal onClose={() => setSettingsOpen(false)} label={t("jellyfin.settings")}
            class="z-[70] flex items-center justify-center p-4 bg-black/40">
            <Motion.div {...pop} class="w-full flex justify-center">
              <SettingsPanel recap={recap} />
            </Motion.div>
          </Modal>
        </Show>
        <recap.Composer />
      </Show>
    </div>
  );
}

// ── Sign-in ───────────────────────────────────────────────────────────────────

function ConnectForm() {
  const { t } = useI18n();
  const [server, setServer] = createSignal(prefillUrl());
  // An invite can arrive while this form is already up (signed in nowhere yet)
  createEffect(() => { const u = prefillUrl(); if (u) setServer(u); });
  const [user, setUser] = createSignal("");
  const [pass, setPass] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal<string | null>(null);

  // An https page can't fetch from plain http (except localhost) — the browser
  // blocks it before Jellyfin sees anything, with no useful error.
  const mixedContent = () => {
    const s = server().trim();
    return location.protocol === "https:" && /^http:\/\//i.test(s) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(s);
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      addServer(await authenticate(normaliseServer(server()), user().trim(), pass(), deviceId()));
      setPass("");
    } catch (ex) {
      setErr(ex instanceof JellyfinError && ex.status === 401 ? t("jellyfin.err_credentials") : t("jellyfin.err_unreachable"));
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full bg-transparent border-0 border-b border-rim focus:border-accent outline-none py-2 text-txt placeholder:text-muted/60 transition-colors";

  return (
    <form onSubmit={submit} class="max-w-sm mx-auto mt-8 space-y-5">
      <Show when={pendingJoin()} fallback={<p class="text-sm text-muted">{t("jellyfin.connect_intro")}</p>}>
        {(p) => (
          <p class="text-sm text-txt p-4 rounded-2xl bg-elevated/50">
            {t("jellyfin.party_signin_to_join", { server: p().jf })}
          </p>
        )}
      </Show>
      <label class="block space-y-1">
        <span class="text-xs text-muted">{t("jellyfin.server_url")}</span>
        <input type="url" required value={server()} onInput={(e) => setServer(e.currentTarget.value)}
          placeholder="https://jellyfin.example.com" class={field} autocomplete="url" />
      </label>
      <Show when={mixedContent()}>
        <p class="text-xs text-red-500">{t("jellyfin.mixed_content")}</p>
      </Show>
      <label class="block space-y-1">
        <span class="text-xs text-muted">{t("jellyfin.username")}</span>
        <input type="text" required value={user()} onInput={(e) => setUser(e.currentTarget.value)}
          class={field} autocomplete="username" />
      </label>
      <label class="block space-y-1">
        <span class="text-xs text-muted">{t("jellyfin.password")}</span>
        <input type="password" value={pass()} onInput={(e) => setPass(e.currentTarget.value)}
          class={field} autocomplete="current-password" />
      </label>
      <Show when={err()}>
        <p class="text-sm text-red-500">{err()}</p>
      </Show>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-[0.6875rem] text-muted">{t("jellyfin.password_note")}</p>
        <Show when={servers().length > 0}>
          <button type="button" onClick={() => { setPendingJoin(null); setAdding(false); }} class={`${ghostPill} ml-auto`}>
            {t("jellyfin.cancel")}
          </button>
        </Show>
        <button type="submit" disabled={busy()} class={primaryPill}>
          {busy() ? t("jellyfin.connecting") : t("jellyfin.connect")}
        </button>
      </div>
    </form>
  );
}
