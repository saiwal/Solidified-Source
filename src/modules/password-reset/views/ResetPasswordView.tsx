import { createSignal, Show, Switch, Match } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchResetTokenState, confirmPasswordReset } from "../api/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { Spinner } from "@ui/Spinner";

export default function ResetPasswordView() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const token = () => params.token;

  const [state] = createQueryResource("password-reset", token, fetchResetTokenState);

  const [password, setPassword] = createSignal("");
  const [password2, setPassword2] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [done, setDone] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");

    if (password() !== password2()) {
      setError(t("auth.reset_password_mismatch"));
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(token(), password(), password2());
      setDone(true);
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.reset_invalid"));
      setLoading(false);
    }
  };

  return (
    <div class="min-h-[60vh] flex items-center justify-center py-8">
      <Card raised class="w-full max-w-md p-8">
        <div class="mb-6 text-center">
          <div
            class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-txt mb-4
                   text-[0.6875rem] font-bold select-none"
            style="color: var(--color-surface)"
          >
            Hz
          </div>
          <h1 class="text-2xl font-bold text-txt">{t("auth.reset_new_password_title")}</h1>
        </div>

        <Show when={state.loading}>
          <div class="flex justify-center py-8">
            <Spinner size="xl" tone="accent" label={t("ui.loading")} />
          </div>
        </Show>

        <Show when={state.error}>
          <div class="text-center space-y-4">
            <p class="text-sm text-muted">{t("auth.reset_invalid")}</p>
            <A href="/forgot-password" class="text-sm text-accent hover:underline">
              {t("auth.reset_request_title")}
            </A>
          </div>
        </Show>

        <Show when={state()}>
          {(s) => (
            <Switch>
              <Match when={!s().valid}>
                <div class="text-center space-y-4">
                  <p class="text-sm text-muted">{t("auth.reset_expired")}</p>
                  <A
                    href="/forgot-password"
                    class="inline-block py-2 px-4 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {t("auth.reset_request_title")}
                  </A>
                </div>
              </Match>

              <Match when={s().valid && done()}>
                <div class="flex justify-center py-8">
                  <Spinner size="xl" tone="accent" label={t("ui.loading")} />
                </div>
              </Match>

              <Match when={s().valid && !done()}>
                <form onSubmit={handleSubmit} class="space-y-4">
                  <div class="space-y-1">
                    <label class="text-sm font-medium text-txt" for="reset-password">
                      {t("auth.reset_new_password_label")}
                    </label>
                    <Input
                      class="w-full"
                      id="reset-password"
                      type="password"
                      autocomplete="new-password"
                      required
                      disabled={loading()}
                      value={password()}
                      onInput={(e) => setPassword(e.currentTarget.value)}
                      placeholder={t("auth.password_placeholder")}
                    />
                  </div>

                  <div class="space-y-1">
                    <label class="text-sm font-medium text-txt" for="reset-password2">
                      {t("auth.reset_confirm_password_label")}
                    </label>
                    <Input
                      class="w-full"
                      id="reset-password2"
                      type="password"
                      autocomplete="new-password"
                      required
                      disabled={loading()}
                      value={password2()}
                      onInput={(e) => setPassword2(e.currentTarget.value)}
                      placeholder={t("auth.password_placeholder")}
                    />
                  </div>

                  <Show when={error()}>
                    <p class="text-sm text-danger-txt text-center">{error()}</p>
                  </Show>

                  <Button class="w-full" type="submit" disabled={loading() || !password() || !password2()}>
                    {loading() ? t("auth.reset_submitting") : t("auth.reset_submit")}
                  </Button>
                </form>
              </Match>
            </Switch>
          )}
        </Show>
      </Card>
    </div>
  );
}
