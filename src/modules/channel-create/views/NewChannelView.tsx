import { createSignal, createEffect, on, onCleanup, createMemo, For, Show, Switch, Match } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import {
  fetchNewChannelMeta,
  fetchNameSuggestion,
  checkNickname,
  createChannel,
} from "../api/api";
import type { ThemeId } from "@utsukta/spa-core/types/theme.types";
import type { FontSize } from "@utsukta/spa-core/lib/typography";
import type { CornerRadius } from "@utsukta/spa-core/lib/corner-radius";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import IdentityStep from "./steps/IdentityStep";
import ProtocolsStep from "./steps/ProtocolsStep";
import IntegrationsStep from "./steps/IntegrationsStep";
import AppearanceStep from "./steps/AppearanceStep";
import ReviewStep from "./steps/ReviewStep";
import SuccessStep from "./steps/SuccessStep";
import { Button } from "@ui/Button";
import { Card } from "@ui/Card";
import { Spinner } from "@ui/Spinner";
import { EmptyState } from "@ui/EmptyState";

type StepId = "identity" | "protocols" | "integrations" | "appearance" | "review";

export default function NewChannelView() {
  const { t } = useI18n();
  const [meta] = createQueryResource("new-channel-meta", fetchNewChannelMeta);

  const [step, setStep] = createSignal<StepId>("identity");
  const [done, setDone] = createSignal(false);

  const [name, setName] = createSignal("");
  const [nickname, setNickname] = createSignal("");
  const [nicknameEdited, setNicknameEdited] = createSignal(false);
  const [role, setRole] = createSignal("");
  const [protocols, setProtocols] = createSignal<Set<string>>(new Set());
  const [integrations, setIntegrations] = createSignal<Set<string>>(new Set());
  const [colorScheme, setColorScheme] = createSignal<ThemeId>("light");
  const [fontSize, setFontSize] = createSignal<FontSize>("medium");
  const [cornerRadius, setCornerRadius] = createSignal<CornerRadius>("default");
  const [submitting, setSubmitting] = createSignal(false);
  const [createdNick, setCreatedNick] = createSignal("");

  // Seed the role picker with the site default once meta loads (only meaningful
  // for a first channel — meta.default_role is "" for additional channels).
  createEffect(() => {
    const m = meta();
    if (m && !role() && m.default_role) setRole(m.default_role);
  });

  // Autofill the nickname from the channel name, debounced, unless the user
  // has already hand-edited the nickname field themselves.
  let autofillTimer: number | undefined;
  createEffect(on(name, (n) => {
    if (nicknameEdited() || !n.trim()) return;
    window.clearTimeout(autofillTimer);
    autofillTimer = window.setTimeout(async () => {
      try {
        const suggestion = await fetchNameSuggestion(n);
        if (!nicknameEdited()) setNickname(suggestion);
      } catch {
        // best-effort — user can still type a nickname manually
      }
    }, 400);
  }));
  onCleanup(() => window.clearTimeout(autofillTimer));

  // Live nickname availability check, debounced.
  const [checking, setChecking] = createSignal(false);
  const [available, setAvailable] = createSignal<boolean | null>(null);
  const [suggestion, setSuggestion] = createSignal<string | null>(null);
  let checkTimer: number | undefined;
  createEffect(on(nickname, (nick) => {
    setAvailable(null);
    setSuggestion(null);
    window.clearTimeout(checkTimer);
    if (!nick.trim()) {
      setChecking(false);
      return;
    }
    setChecking(true);
    checkTimer = window.setTimeout(async () => {
      try {
        const res = await checkNickname(nick, name());
        setAvailable(res.available);
        setSuggestion(res.available ? null : res.suggestion);
      } catch {
        setAvailable(null);
      } finally {
        setChecking(false);
      }
    }, 400);
  }));
  onCleanup(() => window.clearTimeout(checkTimer));

  const steps = createMemo<StepId[]>(() => {
    const arr: StepId[] = ["identity"];
    if ((meta()?.protocols.length ?? 0) > 0) arr.push("protocols");
    if ((meta()?.integrations.length ?? 0) > 0) arr.push("integrations");
    arr.push("appearance", "review");
    return arr;
  });

  const stepIndex = () => steps().indexOf(step());

  const canProceed = createMemo(() => {
    if (step() === "identity") {
      return name().trim().length > 0 && nickname().trim().length > 0 && available() === true;
    }
    return true;
  });

  function goNext() {
    const idx = stepIndex();
    if (idx < steps().length - 1) setStep(steps()[idx + 1]);
  }
  function goBack() {
    const idx = stepIndex();
    if (idx > 0) setStep(steps()[idx - 1]);
  }

  function toggleProtocol(protocolName: string) {
    setProtocols((prev) => {
      const next = new Set(prev);
      if (next.has(protocolName)) next.delete(protocolName);
      else next.add(protocolName);
      return next;
    });
  }

  function toggleIntegration(appName: string) {
    setIntegrations((prev) => {
      const next = new Set(prev);
      if (next.has(appName)) next.delete(appName);
      else next.add(appName);
      return next;
    });
  }

  function applySuggestion() {
    const s = suggestion();
    if (!s) return;
    setNicknameEdited(true);
    setNickname(s);
  }

  async function handleCreate() {
    setSubmitting(true);
    try {
      const result = await createChannel({
        name: name().trim(),
        nickname: nickname().trim(),
        permissions_role: role() || undefined,
        protocols: Array.from(protocols()),
        integrations: Array.from(integrations()),
        color_scheme: colorScheme(),
        font_size: fontSize(),
        corner_radius: cornerRadius(),
      });
      setCreatedNick(result.nick);
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("channel_create.create_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  function stepLabel(id: StepId): string {
    switch (id) {
      case "identity": return t("channel_create.step_identity");
      case "protocols": return t("channel_create.step_protocols");
      case "integrations": return t("channel_create.step_integrations");
      case "appearance": return t("channel_create.step_appearance");
      case "review": return t("channel_create.step_review");
    }
  }

  return (
    <div class="min-h-[60vh] flex items-center justify-center py-8">
      <Card raised class="w-full max-w-lg p-6 sm:p-8">

        <Show when={!done()}>
          <div class="mb-6 text-center">
            <h1 class="text-xl font-bold text-txt">{t("channel_create.title")}</h1>
            <p class="text-sm text-muted mt-1">{t("channel_create.subtitle")}</p>
            <p class="text-xs text-muted mt-3">
              <A href="/import" class="text-accent hover:underline">
                {t("settings.portability_import_btn")}
              </A>
            </p>
          </div>
        </Show>

        <Show when={meta.loading}>
          <div class="flex justify-center py-8">
            <Spinner size="xl" tone="accent" label={t("ui.loading")} />
          </div>
        </Show>

        <Show when={meta.error}>
          <p class="text-sm text-danger-txt text-center">{t("channel_create.load_error")}</p>
        </Show>

        <Show when={!done() ? meta() : undefined}>
          {(m) => (
            <Show
              when={m().canadd}
              fallback={
                <EmptyState size="sm">{t("channel_create.limit_reached")}</EmptyState>
              }
            >
              {/* Step progress */}
              <div class="flex items-center gap-1.5 mb-6">
                <For each={steps()}>
                  {(s, i) => (
                    <div class="flex-1 flex items-center gap-1.5">
                      <div
                        class={`flex-1 h-1.5 rounded-full transition-colors ${
                          i() <= stepIndex() ? "bg-accent" : "bg-elevated"
                        }`}
                        title={stepLabel(s)}
                      />
                    </div>
                  )}
                </For>
              </div>
              <p class="text-xs text-muted -mt-4 mb-5">
                {t("channel_create.step_progress", {
                  current: String(stepIndex() + 1),
                  total: String(steps().length),
                  label: stepLabel(step()),
                })}
              </p>

              <Switch>
                <Match when={step() === "identity"}>
                  <IdentityStep
                    name={name()}
                    setName={setName}
                    nickname={nickname()}
                    setNickname={(v) => { setNicknameEdited(true); setNickname(v); }}
                    nickhub={m().nickhub}
                    roles={m().roles}
                    role={role()}
                    setRole={setRole}
                    usageMessage={
                      m().limit !== null
                        ? t("channel_create.usage_message", {
                            total: String(m().total_channels),
                            limit: String(m().limit),
                          })
                        : null
                    }
                    canadd={m().canadd}
                    checking={checking()}
                    available={available()}
                    suggestion={suggestion()}
                    onApplySuggestion={applySuggestion}
                  />
                </Match>
                <Match when={step() === "protocols"}>
                  <ProtocolsStep
                    protocols={m().protocols}
                    selected={protocols()}
                    onToggle={toggleProtocol}
                  />
                </Match>
                <Match when={step() === "integrations"}>
                  <IntegrationsStep
                    integrations={m().integrations}
                    selected={integrations()}
                    onToggle={toggleIntegration}
                  />
                </Match>
                <Match when={step() === "appearance"}>
                  <AppearanceStep
                    colorScheme={colorScheme()}
                    setColorScheme={setColorScheme}
                    fontSize={fontSize()}
                    setFontSize={setFontSize}
                    cornerRadius={cornerRadius()}
                    setCornerRadius={setCornerRadius}
                  />
                </Match>
                <Match when={step() === "review"}>
                  <ReviewStep
                    name={name()}
                    nickname={nickname()}
                    nickhub={m().nickhub}
                    role={role()}
                    roles={m().roles}
                    protocols={Array.from(protocols())}
                    integrations={Array.from(integrations())}
                    colorScheme={colorScheme()}
                  />
                </Match>
              </Switch>

              {/* Nav buttons */}
              <div class="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-rim">
                <Button variant="ghost" onClick={goBack} disabled={stepIndex() === 0 || submitting()}>
                  {t("channel_create.back")}
                </Button>

                <Show
                  when={step() !== "review"}
                  fallback={
                    <Button onClick={handleCreate} disabled={submitting()}>
                      {submitting() ? t("channel_create.creating") : t("channel_create.create_btn")}
                    </Button>
                  }
                >
                  <Button onClick={goNext} disabled={!canProceed()}>
                    {t("channel_create.next")}
                  </Button>
                </Show>
              </div>
            </Show>
          )}
        </Show>

        <Show when={done()}>
          <SuccessStep name={name()} nick={createdNick()} />
        </Show>

      </Card>
    </div>
  );
}
