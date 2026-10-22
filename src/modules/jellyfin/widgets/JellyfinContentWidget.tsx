import { createSignal, createEffect, Show, onMount, onCleanup } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { authenticate, normaliseServer, JellyfinError } from "../api";
import { Modal } from "@ui/Modal";
import PlayerBar from "../player/PlayerBar";
import FullPlayer from "../player/FullPlayer";
import { Browser } from "../library/views";
import VaultUnlock from "../VaultUnlock";
import { vaultStatus, unlockVault, type VaultStatus } from "@utsukta/spa-core/lib/vault";
import SettingsPanel, { useRecapComposer } from "../SettingsPanel";
import { settingsOpen, setSettingsOpen } from "../settings";
import { videoActive } from "../video/state";
import { Motion, fade, pop } from "../anim";
import {
  session, servers, deviceId, isConnected, adding, setAdding, prefillUrl, addServer,
  current, toggle, next, prev, seek, position, muted, setMuted, startAddServer, sessionFor, setActive, rememberOnHub, syncFromHub,
} from "../store";
import { joinParty, party } from "../syncplay";
import { Button } from "@ui/Button";
import { Field, Input } from "@ui/Field";

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
  // Hub-stored sign-ins (once per page load; the mini-player may have started it already)
  void syncFromHub();
  const recap = useRecapComposer();
  return (
    // Tall enough that the player bar rests at the foot of the window even
    // when a page is short; it is sticky within this column.
    <div class="max-w-5xl mx-auto min-h-[calc(100dvh-13rem)] flex flex-col">
      <Show when={isConnected() && !adding()} fallback={
        // A fresh browser has no servers yet — exactly when a locked vault matters most
        <Motion.div {...fade} class="space-y-6"><VaultUnlock /><ConnectForm /></Motion.div>
      }>
        <div class="flex-1 space-y-6">
          <VaultUnlock />
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
  const [remember, setRemember] = createSignal(false);
  // The vault passphrase — asked only when "Remember on my hub" is ticked and
  // this browser hasn't unlocked the vault (or there's none yet: choose one)
  const [vault, setVault] = createSignal<VaultStatus | null>(null);
  const [vpass, setVpass] = createSignal("");
  const [vpass2, setVpass2] = createSignal("");
  createEffect(() => {
    if (remember() && vault() === null) vaultStatus().then(setVault).catch(() => setVault("new"));
  });

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
      if (remember() && vault() === "new" && vpass() !== vpass2()) {
        setErr(t("jellyfin.vault_mismatch"));
        return;
      }
      const session = await authenticate(normaliseServer(server()), user().trim(), pass(), deviceId());
      addServer(session);
      // Signed in either way; storing on the hub is a second, separate step
      if (remember()) {
        const unlocked = vault() === "unlocked" || (await unlockVault(vpass()).catch(() => false));
        if (!unlocked) toast.error(t("jellyfin.vault_wrong_saved"));
        else await rememberOnHub(session).catch((e) => {
          console.warn("[jellyfin] Remember on my hub failed", e);
          toast.error(`${t("jellyfin.hub_store_failed")} (${e instanceof Error ? e.message : e})`, 20_000);
        });
      }
      setPass("");
      setVpass("");
      setVpass2("");
    } catch (ex) {
      setErr(ex instanceof JellyfinError && ex.status === 401 ? t("jellyfin.err_credentials") : t("jellyfin.err_unreachable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} class="max-w-sm mx-auto mt-8 space-y-5">
      <Show when={pendingJoin()} fallback={<p class="text-sm text-muted">{t("jellyfin.connect_intro")}</p>}>
        {(p) => (
          <p class="text-sm text-txt p-4 rounded-2xl bg-elevated/50">
            {t("jellyfin.party_signin_to_join", { server: p().jf })}
          </p>
        )}
      </Show>
      <Field label={t("jellyfin.server_url")} size="sm">
        <Input
        class="w-full"
        type="url"
        required
        value={server()}
        onInput={(e) => setServer(e.currentTarget.value)}
        placeholder="https://jellyfin.example.com"
        autocomplete="url"
        />
      </Field>
      <Show when={mixedContent()}>
        <p class="text-xs text-danger-txt">{t("jellyfin.mixed_content")}</p>
      </Show>
      <Field label={t("jellyfin.username")} size="sm">
        <Input
        class="w-full"
        type="text"
        required
        value={user()}
        onInput={(e) => setUser(e.currentTarget.value)}
        autocomplete="username"
        />
      </Field>
      <Field label={t("jellyfin.password")} size="sm">
        <Input
        class="w-full"
        type="password"
        value={pass()}
        onInput={(e) => setPass(e.currentTarget.value)}
        autocomplete="current-password"
        />
      </Field>
      <label class="flex items-start gap-3 text-sm text-txt">
        <input type="checkbox" class="mt-0.5" checked={remember()} onChange={(e) => setRemember(e.currentTarget.checked)} />
        <span class="space-y-0.5">
          <span class="block">{t("jellyfin.hub_remember")}</span>
          <span class="block text-xs text-muted">{t("jellyfin.hub_remember_help")}</span>
        </span>
      </label>
      <Show when={remember() && (vault() === "new" || vault() === "locked")}>
        <Field label={vault() === "new" ? t("jellyfin.vault_choose") : t("jellyfin.vault_passphrase")} size="sm">
          <Input
          class="w-full"
          type="password"
          required
          minLength={vault() === "new" ? 10 : undefined}
          value={vpass()}
          onInput={(e) => setVpass(e.currentTarget.value)}
          autocomplete={vault() === "new" ? "new-password" : "current-password"}
          />
        </Field>
        <Show when={vault() === "new"}>
          <Field label={t("jellyfin.vault_confirm")} size="sm">
            <Input
            class="w-full"
            type="password"
            required
            value={vpass2()}
            onInput={(e) => setVpass2(e.currentTarget.value)}
            autocomplete="new-password"
            />
          </Field>
          <p class="text-xs text-muted">{t("jellyfin.vault_new_help")}</p>
        </Show>
      </Show>
      <Show when={err()}>
        <p class="text-sm text-danger-txt">{err()}</p>
      </Show>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-[0.6875rem] text-muted">{t("jellyfin.password_note")}</p>
        <Show when={servers().length > 0}>
          <Button variant="ghost" class="ml-auto" onClick={() => { setPendingJoin(null); setAdding(false); }}>
            {t("jellyfin.cancel")}
          </Button>
        </Show>
        <Button type="submit" disabled={busy()}>
          {busy() ? t("jellyfin.connecting") : t("jellyfin.connect")}
        </Button>
      </div>
    </form>
  );
}
