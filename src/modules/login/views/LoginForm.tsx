import { createSignal, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { fetchLoginToken, submitLogin, submitRmagic } from "../api/api";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useNavData } from "@utsukta/spa-core/store/nav-store";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";

interface LoginFormProps {
  // Path on this site to land on after login. Defaults to /hq for local
  // login and the site root for remote login.
  dest?: string;
}

export default function LoginForm(props: LoginFormProps) {
  const { t } = useI18n();
  const navData = useNavData();
  const [token, setToken] = createSignal("");
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [remember, setRemember] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [remoteAddr, setRemoteAddr] = createSignal("");
  const [remoteLoading, setRemoteLoading] = createSignal(false);

  onMount(async () => {
    try {
      setToken(await fetchLoginToken());
    } catch {
      toast.error(t("auth.load_form_error"));
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await submitLogin(username(), password(), token(), remember());
      // Full reload so auth state re-initialises from scratch. An account
      // with no channel yet (e.g. signed up while auto_channel_create was
      // off) has to go through channel creation before anything else in
      // the SPA — which all assumes an active channel — can render.
      window.location.href = result.nick ? (props.dest ?? "/hq") : "/new_channel";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.login_failed"));
      // The server consumes the login token on every attempt, even failed
      // ones. Keep the form disabled until a fresh token has actually
      // arrived, otherwise a fast retry reuses the dead token and always
      // fails with a confusing "invalid security token" error.
      setToken("");
      try {
        setToken(await fetchLoginToken());
      } catch {
        toast.error(t("auth.load_form_error"));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRemoteSubmit = async (e: Event) => {
    e.preventDefault();
    setRemoteLoading(true);

    try {
      const url = await submitRmagic(remoteAddr().trim(), props.dest ?? "/");
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.login_failed"));
      setRemoteLoading(false);
    }
  };

  return (
    <Card raised class="w-full max-w-lg p-8">
      {/* Brand */}
      <div class="mb-6 text-center">
        <img
          src={navData()?.sitelogo || import.meta.env.BASE_URL + "hubzilla.svg"}
          alt=""
          aria-hidden="true"
          class="inline-block w-20 h-20 rounded-xl object-contain mb-4"
        />
        <h1 class="text-2xl font-bold text-txt">{t("auth.sign_in")}</h1>
        <p class="text-sm text-muted mt-1">{t("auth.continue_to")}</p>
      </div>

      {/* Local login */}
      <form onSubmit={handleSubmit} class="space-y-4" noValidate={false}>
        <div class="space-y-1">
          <label class="text-sm font-medium text-txt" for="login-username">
            {t("auth.email_or_username")}
          </label>
          <Input
            class="w-full"
            id="login-username"
            type="text"
            autocomplete="username"
            required
            disabled={loading()}
            value={username()}
            onInput={(e) => setUsername(e.currentTarget.value)}
            placeholder={t("auth.email_placeholder")}
          />
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-txt" for="login-password">
              {t("auth.password")}
            </label>
            <A href="/forgot-password" class="text-xs text-accent hover:underline">
              {t("auth.forgot_password_link")}
            </A>
          </div>
          <Input
            class="w-full"
            id="login-password"
            type="password"
            autocomplete="current-password"
            required
            disabled={loading()}
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            placeholder={t("auth.password_placeholder")}
          />
        </div>

        <div class="flex items-center gap-2">
          <input
            id="login-remember"
            type="checkbox"
            disabled={loading()}
            checked={remember()}
            onChange={(e) => setRemember(e.currentTarget.checked)}
            class="accent-accent"
          />
          <label class="text-sm text-txt cursor-pointer" for="login-remember">
            {t("auth.remember_me")}
          </label>
        </div>

        <Button class="w-full" type="submit" disabled={loading() || !token()}>
          {loading() ? t("auth.signing_in") : t("auth.sign_in")}
        </Button>
      </form>

      {/* Register link */}
      <p class="text-center text-sm text-muted mt-4">
        {t("auth.no_account_yet")}{" "}
        <A href="/register" class="text-accent hover:underline font-medium">
          {t("auth.register_link")}
        </A>
      </p>

      {/* Divider */}
      <div class="relative my-6">
        <div class="absolute inset-0 flex items-center">
          <div class="w-full border-t border-rim" />
        </div>
        <div class="relative flex justify-center">
          <span class="px-3 bg-surface text-xs text-muted uppercase tracking-wide">
            {t("auth.or")}
          </span>
        </div>
      </div>

      {/* Remote login */}
      <form onSubmit={handleRemoteSubmit} class="space-y-3">
        <div class="space-y-1">
          <label class="text-sm font-medium text-txt" for="rmagic-addr">
            {t("auth.remote_address_label")}
          </label>
          <Input
            class="w-full"
            id="rmagic-addr"
            name="address"
            type="text"
            autocomplete="email"
            required
            disabled={remoteLoading()}
            value={remoteAddr()}
            onInput={(e) => setRemoteAddr(e.currentTarget.value)}
            placeholder={t("auth.remote_address_placeholder")}
          />
          <p class="text-xs text-muted">{t("auth.remote_login_hint")}</p>
        </div>
        <Button
          variant="ghost"
          class="w-full"
          type="submit"
          disabled={remoteLoading() || !remoteAddr().trim()}
        >
          {t("auth.remote_login_btn")}
        </Button>
      </form>
    </Card>
  );
}
