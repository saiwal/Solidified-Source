import { createSignal, Show, Switch, Match } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchRegisterConfig, submitRegister } from "../api/api";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useNavData } from "@utsukta/spa-core/store/nav-store";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { Spinner } from "@ui/Spinner";
import { Badge } from "@ui/Badge";

export default function RegisterView() {
  const { t } = useI18n();
  const navData = useNavData();

  const [config] = createQueryResource("register-config", fetchRegisterConfig);

  const [step, setStep] = createSignal<"form" | "check_email" | "pending_approval">("form");
  const [regateUrl, setRegateUrl] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [showInvite, setShowInvite] = createSignal(false);

  const [name, setName] = createSignal("");
  const [nickname, setNickname] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [password2, setPassword2] = createSignal("");
  const [tos, setTos] = createSignal(false);
  const [inviteCode, setInviteCode] = createSignal("");
  const [registerMsg, setRegisterMsg] = createSignal("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const cfg = config();
    if (!cfg) return;

    setLoading(true);
    try {
      const result = await submitRegister({
        token: cfg.token,
        email: email() || undefined,
        password: password(),
        password2: password2(),
        name: cfg.auto_channel_create ? name() : undefined,
        nickname: cfg.auto_channel_create ? nickname() : undefined,
        tos: tos(),
        invite_code: inviteCode() || undefined,
        register_msg: registerMsg() || undefined,
      });

      if (result.next === "complete") {
        // No channel was created during registration (auto_channel_create is
        // off site-wide) — send the new account through the wizard instead
        // of /hq, which requires an active channel to render meaningfully.
        window.location.href = result.nick ? "/hq" : "/new_channel";
      } else if (result.next === "check_email") {
        setRegateUrl(result.regate_url);
        setStep("check_email");
      } else if (result.next === "pending_approval") {
        setStep("pending_approval");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.login_failed"));
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-rim bg-base text-txt text-sm " +
    "placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent " +
    "disabled:opacity-60 transition-colors";

  const labelClass = "text-sm font-medium text-txt";

  return (
    <div class="min-h-[60vh] flex items-center justify-center py-8">
      <Card raised class="w-full max-w-lg p-8">

        {/* Brand */}
        <div class="mb-6 text-center">
          <img
            src={navData()?.sitelogo || import.meta.env.BASE_URL + "hubzilla.svg"}
            alt=""
            aria-hidden="true"
            class="inline-block w-20 h-20 rounded-xl object-contain mb-4"
          />
          <h1 class="text-2xl font-bold text-txt">{t("auth.register_title")}</h1>
          <p class="text-sm text-muted mt-1">{t("auth.register_subtitle")}</p>
        </div>

        <Show when={config.loading}>
          <div class="flex justify-center py-8">
            <Spinner size="xl" tone="accent" label={t("ui.loading")} />
          </div>
        </Show>

        <Show when={config.error}>
          <p class="text-sm text-danger-txt text-center">{t("auth.load_form_error")}</p>
        </Show>

        <Show when={config()}>
          {(cfg) => (
            <Switch>

              {/* Registration closed */}
              <Match when={cfg().closed}>
                <div class="text-center space-y-2">
                  <p class="text-sm text-muted">{t("auth.register_closed")}</p>
                  <p class="text-sm text-muted">
                    {t("auth.register_affiliated_hub_note")}{" "}
                    <A href="/directory/hubs" class="text-accent hover:underline font-medium">
                      {t("auth.register_browse_hubs")}
                    </A>
                  </p>
                </div>
              </Match>

              {/* Email sent */}
              <Match when={step() === "check_email"}>
                <div class="text-center space-y-4">
                  <div class="text-4xl">✉️</div>
                  <h2 class="text-lg font-semibold text-txt">{t("auth.register_check_email_title")}</h2>
                  <p class="text-sm text-muted">{t("auth.register_check_email_desc")}</p>
                  <a
                    href={regateUrl()}
                    class="block w-full py-2.5 px-4 rounded-lg bg-accent text-accent-fg font-medium text-sm
                           text-center hover:opacity-90 active:opacity-80 transition-opacity"
                  >
                    {t("auth.register_verify_btn")}
                  </a>
                  <p class="text-xs text-muted break-all">{regateUrl()}</p>
                </div>
              </Match>

              {/* Pending approval */}
              <Match when={step() === "pending_approval"}>
                <div class="text-center space-y-3">
                  <div class="text-4xl">⏳</div>
                  <h2 class="text-lg font-semibold text-txt">{t("auth.register_pending_title")}</h2>
                  <p class="text-sm text-muted">{t("auth.register_pending_desc")}</p>
                </div>
              </Match>

              {/* Registration form */}
              <Match when={step() === "form"}>
                <div class="space-y-3">

                  {/* Policy / invite notes */}
                  <Show when={cfg().policy === 1}>
                    <p class="text-xs text-muted bg-elevated rounded-lg px-3 py-2">
                      {t("auth.register_approval_note")}{" "}
                      {t("auth.register_affiliated_hub_note")}{" "}
                      <A href="/directory/hubs" class="text-accent hover:underline font-medium">
                        {t("auth.register_browse_hubs")}
                      </A>
                    </p>
                  </Show>
                  <Show when={cfg().invite_only}>
                    <p class="text-xs text-muted bg-elevated rounded-lg px-3 py-2">
                      {t("auth.register_invite_required")}
                    </p>
                  </Show>

                  {/* Custom register text */}
                  <Show when={cfg().register_text}>
                    <div
                      class="text-xs text-muted prose prose-sm max-w-none"
                      innerHTML={cfg().register_text}
                    />
                  </Show>

                  <form onSubmit={handleSubmit} class="space-y-4" noValidate>

                    {/* Name */}
                    <Show when={cfg().auto_channel_create}>
                      <div class="space-y-1">
                        <label class={labelClass} for="reg-name">
                          {t("auth.register_name_label")}
                        </label>
                        <Input
                          class="w-full"
                          id="reg-name"
                          type="text"
                          autocomplete="name"
                          required
                          disabled={loading()}
                          value={name()}
                          onInput={(e) => setName(e.currentTarget.value)}
                          placeholder={t("auth.register_name_ph")}
                        />
                      </div>

                      {/* Nickname */}
                      <div class="space-y-1">
                        <label class={labelClass} for="reg-nick">
                          {t("auth.register_nick_label")}
                        </label>
                        <div class="flex items-stretch gap-0">
                          <input
                            id="reg-nick"
                            type="text"
                            autocomplete="username"
                            required
                            disabled={loading()}
                            value={nickname()}
                            onInput={(e) => setNickname(e.currentTarget.value.toLowerCase())}
                            class={inputClass + " rounded-r-none flex-1"}
                            placeholder={t("auth.register_nick_ph")}
                          />
                          <Badge class="rounded-r-lg whitespace-nowrap">
                            {cfg().nickhub}
                          </Badge>
                        </div>
                      </div>
                    </Show>

                    {/* Email */}
                    <div class="space-y-1">
                      <label class={labelClass} for="reg-email">
                        {t("auth.register_email_label")}
                      </label>
                      <Input
                        class="w-full"
                        id="reg-email"
                        type="email"
                        autocomplete="email"
                        required={cfg().verify_email}
                        disabled={loading()}
                        value={email()}
                        onInput={(e) => setEmail(e.currentTarget.value)}
                        placeholder="you@example.com"
                      />
                      <p class="text-xs text-muted">
                        {cfg().verify_email
                          ? t("auth.register_email_required")
                          : t("auth.register_email_optional")}
                      </p>
                    </div>

                    {/* Password */}
                    <div class="space-y-1">
                      <label class={labelClass} for="reg-pass">
                        {t("auth.register_pass_label")}
                      </label>
                      <Input
                        class="w-full"
                        id="reg-pass"
                        type="password"
                        autocomplete="new-password"
                        required
                        disabled={loading()}
                        value={password()}
                        onInput={(e) => setPassword(e.currentTarget.value)}
                        placeholder="••••••••"
                      />
                    </div>

                    {/* Confirm password */}
                    <div class="space-y-1">
                      <label class={labelClass} for="reg-pass2">
                        {t("auth.register_pass2_label")}
                      </label>
                      <Input
                        class="w-full"
                        id="reg-pass2"
                        type="password"
                        autocomplete="new-password"
                        required
                        disabled={loading()}
                        value={password2()}
                        onInput={(e) => setPassword2(e.currentTarget.value)}
                        placeholder="••••••••"
                      />
                    </div>

                    {/* Invite code */}
                    <Show when={cfg().invite_only || cfg().invite_also}>
                      <Show when={!cfg().invite_only}>
                        <button
                          type="button"
                          onClick={() => setShowInvite((v) => !v)}
                          class="text-xs text-accent hover:underline"
                        >
                          {t("auth.register_invite_toggle")}
                        </button>
                      </Show>
                      <Show when={cfg().invite_only || showInvite()}>
                        <div class="space-y-1">
                          <label class={labelClass} for="reg-invite">
                            {t("auth.register_invite_label")}
                          </label>
                          <Input
                            class="w-full"
                            id="reg-invite"
                            type="text"
                            required={cfg().invite_only}
                            disabled={loading()}
                            value={inviteCode()}
                            onInput={(e) => setInviteCode(e.currentTarget.value)}
                            placeholder={t("auth.register_invite_ph")}
                          />
                        </div>
                      </Show>
                    </Show>

                    {/* Approval message */}
                    <Show when={cfg().policy === 1}>
                      <div class="space-y-1">
                        <label class={labelClass} for="reg-msg">
                          {t("auth.register_msg_label")}
                        </label>
                        <textarea
                          id="reg-msg"
                          rows={3}
                          disabled={loading()}
                          value={registerMsg()}
                          onInput={(e) => setRegisterMsg(e.currentTarget.value)}
                          class={inputClass + " resize-none"}
                          placeholder={t("auth.register_msg_ph")}
                        />
                      </div>
                    </Show>

                    {/* Terms of Service */}
                    <Show when={cfg().enable_tos}>
                      <div class="flex items-start gap-2">
                        <input
                          id="reg-tos"
                          type="checkbox"
                          required
                          disabled={loading()}
                          checked={tos()}
                          onChange={(e) => setTos(e.currentTarget.checked)}
                          class="mt-0.5 accent-accent"
                        />
                        <label for="reg-tos" class="text-sm text-txt leading-snug cursor-pointer">
                          <Show
                            when={!cfg().no_age_restriction}
                            fallback={
                              <>
                                {t("auth.register_tos_agree")}{" "}
                                <a
                                  href={cfg().tos_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="text-accent hover:underline"
                                >
                                  {t("auth.register_tos_link")}
                                </a>
                                {" "}{t("auth.register_tos_suffix")}
                              </>
                            }
                          >
                            {t("auth.register_tos_age_prefix", { age: String(cfg().min_age) })}{" "}
                            <a
                              href={cfg().tos_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-accent hover:underline"
                            >
                              {t("auth.register_tos_link")}
                            </a>
                            {" "}{t("auth.register_tos_suffix")}
                          </Show>
                        </label>
                      </div>
                    </Show>

                    {/* Submit */}
                    <Button class="w-full" type="submit" disabled={loading()}>
                      {loading() ? t("auth.registering") : t("auth.register_submit")}
                    </Button>
                  </form>

                  {/* Sign-in link */}
                  <p class="text-center text-sm text-muted pt-2">
                    {t("auth.already_have_account")}{" "}
                    <A href="/login" class="text-accent hover:underline font-medium">
                      {t("auth.sign_in")}
                    </A>
                  </p>
                </div>
              </Match>
            </Switch>
          )}
        </Show>
      </Card>
    </div>
  );
}
