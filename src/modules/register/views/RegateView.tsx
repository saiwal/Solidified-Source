import { createSignal, Show, Switch, Match } from "solid-js";
import { useParams, A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchRegateState, submitRegate } from "../api/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { Spinner } from "@ui/Spinner";
import { Badge } from "@ui/Badge";

export default function RegateView() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const token = () => params.token;

  const [state] = createQueryResource("regate", token, fetchRegateState);

  const [pin, setPin] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [done, setDone] = createSignal<"complete" | "pending_approval" | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await submitRegate(token(), pin().trim());
      if (result.next === "complete") {
        setDone("complete");
        // No channel was created during registration (auto_channel_create is
        // off site-wide) — send the new account through the wizard instead
        // of /hq, which requires an active channel to render meaningfully.
        window.location.href = result.nick ? "/hq" : "/new_channel";
      } else {
        setDone("pending_approval");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.regate_invalid"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="min-h-[60vh] flex items-center justify-center py-8">
      <Card raised class="w-full max-w-md p-8">

        {/* Brand */}
        <div class="mb-6 text-center">
          <div
            class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-txt mb-4
                   text-[0.6875rem] font-bold select-none"
            style="color: var(--color-surface)"
          >
            Hz
          </div>
          <h1 class="text-2xl font-bold text-txt">{t("auth.regate_title")}</h1>
        </div>

        <Show when={state.loading}>
          <div class="flex justify-center py-8">
            <Spinner size="xl" tone="accent" label={t("ui.loading")} />
          </div>
        </Show>

        <Show when={state.error}>
          <div class="text-center space-y-4">
            <p class="text-sm text-muted">{t("auth.regate_invalid")}</p>
            <A href="/register" class="text-sm text-accent hover:underline">
              {t("auth.register_link")}
            </A>
          </div>
        </Show>

        <Show when={state()}>
          {(s) => (
            <Switch>

              {/* Expired */}
              <Match when={s().expired}>
                <div class="text-center space-y-4">
                  <p class="text-sm text-muted">{t("auth.regate_expired")}</p>
                  <A
                    href="/register"
                    class="inline-block py-2 px-4 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    {t("auth.register_link")}
                  </A>
                </div>
              </Match>

              {/* Already pending approval (was verified before, waiting for admin) */}
              <Match when={s().pending_approval || done() === "pending_approval"}>
                <div class="text-center space-y-3">
                  <div class="text-4xl">⏳</div>
                  <h2 class="text-lg font-semibold text-txt">{t("auth.register_pending_title")}</h2>
                  <p class="text-sm text-muted">{t("auth.regate_pending_note")}</p>
                </div>
              </Match>

              {/* Redirecting after success */}
              <Match when={done() === "complete"}>
                <div class="flex justify-center py-8">
                  <Spinner size="xl" tone="accent" label={t("ui.loading")} />
                </div>
              </Match>

              {/* Verification form */}
              <Match when={!s().expired && !s().pending_approval && !done()}>
                <div class="space-y-5">
                  <p class="text-sm text-muted text-center">{t("auth.regate_email_hint")}</p>

                  <Show when={s().email}>
                    <div class="text-center">
                      <Badge class="font-mono break-all">
                        {s().email}
                      </Badge>
                    </div>
                  </Show>

                  <form onSubmit={handleSubmit} class="space-y-4">
                    <div class="space-y-1">
                      <label class="text-sm font-medium text-txt" for="regate-pin">
                        {t("auth.regate_code_label")}
                      </label>
                      <Input
                        class="w-full font-mono"
                        id="regate-pin"
                        type="text"
                        inputmode="text"
                        autocomplete="one-time-code"
                        required
                        disabled={loading()}
                        value={pin()}
                        onInput={(e) => setPin(e.currentTarget.value.toLowerCase().replace(/\s/g, ""))}
                        placeholder={t("auth.regate_code_ph")}
                        maxLength={s().type === "e" ? 24 : 6}
                      />
                      <Show when={s().type === "e"}>
                        <p class="text-xs text-muted">
                          {pin().replace(/\s/g, "").length} / 24
                        </p>
                      </Show>
                    </div>

                    <Show when={error()}>
                      <p class="text-sm text-danger-txt text-center">{error()}</p>
                    </Show>

                    <Button
                      class="w-full"
                      type="submit"
                      disabled={loading() || (s().type === "e" ? pin().length !== 24 : pin().length !== 6)}
                    >
                      {loading() ? t("auth.regate_verifying") : t("auth.regate_verify")}
                    </Button>
                  </form>

                  <p class="text-center text-sm text-muted pt-1">
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
