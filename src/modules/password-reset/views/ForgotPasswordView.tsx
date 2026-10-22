import { createSignal, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { fetchPasswordResetToken, requestPasswordReset } from "../api/api";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";

export default function ForgotPasswordView() {
  const { t } = useI18n();
  const [token, setToken] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [sent, setSent] = createSignal(false);

  onMount(async () => {
    try {
      setToken(await fetchPasswordResetToken());
    } catch {
      toast.error(t("auth.load_form_error"));
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setLoading(true);

    try {
      await requestPasswordReset(email().trim(), token());
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.reset_request_failed"));
      setToken("");
      try {
        setToken(await fetchPasswordResetToken());
      } catch {
        toast.error(t("auth.load_form_error"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="min-h-[60vh] flex items-center justify-center">
      <Card raised class="w-full max-w-md p-8">
        <div class="mb-8 text-center">
          <div
            class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-txt mb-4
                   text-[0.6875rem] font-bold text-base select-none"
            style="color: var(--color-surface)"
          >
            Hz
          </div>
          <h1 class="text-2xl font-bold text-txt">{t("auth.reset_request_title")}</h1>
        </div>

        <Show
          when={!sent()}
          fallback={
            <div class="text-center space-y-4">
              <p class="text-sm text-txt font-medium">{t("auth.reset_check_email_title")}</p>
              <p class="text-sm text-muted">{t("auth.reset_check_email_desc")}</p>
              <A href="/login" class="inline-block text-sm text-accent hover:underline font-medium">
                {t("auth.sign_in")}
              </A>
            </div>
          }
        >
          <form onSubmit={handleSubmit} class="space-y-4">
            <p class="text-sm text-muted">{t("auth.reset_request_desc")}</p>

            <div class="space-y-1">
              <label class="text-sm font-medium text-txt" for="reset-email">
                {t("auth.reset_email_label")}
              </label>
              <Input
                class="w-full"
                id="reset-email"
                type="email"
                autocomplete="email"
                required
                disabled={loading()}
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
                placeholder={t("auth.email_placeholder")}
              />
            </div>

            <Button class="w-full" type="submit" disabled={loading() || !token()}>
              {loading() ? t("auth.reset_requesting") : t("auth.reset_request_submit")}
            </Button>

            <p class="text-center text-sm text-muted">
              <A href="/login" class="text-accent hover:underline font-medium">
                {t("auth.sign_in")}
              </A>
            </p>
          </form>
        </Show>
      </Card>
    </div>
  );
}
