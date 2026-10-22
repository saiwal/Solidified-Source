import { For, Show } from "solid-js";
import type { ChannelRole } from "../../api/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Input } from "@ui/Field";
import { Badge } from "@ui/Badge";

const ROLE_HINTS: Record<string, string> = {
  personal: "channel_create.role_hint_personal",
  public: "channel_create.role_hint_public",
  group: "channel_create.role_hint_group",
  custom: "channel_create.role_hint_custom",
};

export default function IdentityStep(props: {
  name: string;
  setName: (v: string) => void;
  nickname: string;
  setNickname: (v: string) => void;
  nickhub: string;
  roles: ChannelRole[];
  role: string;
  setRole: (v: string) => void;
  usageMessage: string | null;
  canadd: boolean;
  checking: boolean;
  available: boolean | null;
  suggestion: string | null;
  onApplySuggestion: () => void;
}) {
  const { t } = useI18n();

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-rim bg-base text-txt text-sm " +
    "placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent " +
    "disabled:opacity-60 transition-colors";

  return (
    <div class="space-y-5">
      <Show when={props.usageMessage}>
        <p
          class={`text-xs rounded-lg px-3 py-2 ${
            props.canadd ? "bg-elevated text-muted" : "bg-danger/10 text-danger-txt"
          }`}
        >
          {props.usageMessage}
        </p>
      </Show>

      {/* Name */}
      <div class="space-y-1">
        <label class="text-sm font-medium text-txt" for="nc-name">
          {t("channel_create.name_label")}
        </label>
        <Input
          class="w-full"
          id="nc-name"
          type="text"
          value={props.name}
          onInput={(e) => props.setName(e.currentTarget.value)}
          placeholder={t("channel_create.name_ph")}
        />
        <p class="text-xs text-muted">{t("channel_create.name_hint")}</p>
      </div>

      {/* Nickname */}
      <div class="space-y-1">
        <label class="text-sm font-medium text-txt" for="nc-nick">
          {t("channel_create.nick_label")}
        </label>
        <div class="flex items-stretch gap-0">
          <input
            id="nc-nick"
            type="text"
            value={props.nickname}
            onInput={(e) => props.setNickname(e.currentTarget.value.toLowerCase())}
            class={inputClass + " rounded-r-none flex-1"}
            placeholder={t("channel_create.nick_ph")}
          />
          <Badge class="rounded-r-lg whitespace-nowrap">
            {props.nickhub}
          </Badge>
        </div>
        <Show when={props.nickname && !props.checking}>
          <Show
            when={props.available}
            fallback={
              <p class="text-xs text-warning-txt">
                {t("channel_create.nick_taken")}{" "}
                <Show when={props.suggestion}>
                  <button
                    type="button"
                    onClick={props.onApplySuggestion}
                    class="text-accent hover:underline font-medium"
                  >
                    {props.suggestion}
                  </button>
                  ?
                </Show>
              </p>
            }
          >
            <p class="text-xs text-success-txt">{t("channel_create.nick_available")}</p>
          </Show>
        </Show>
        <Show when={props.checking}>
          <p class="text-xs text-muted">{t("channel_create.nick_checking")}</p>
        </Show>
        <p class="text-xs text-muted">{t("channel_create.nick_hint")}</p>
      </div>

      {/* Role */}
      <Show when={props.roles.length > 0}>
        <div class="space-y-2">
          <label class="text-sm font-medium text-txt">{t("channel_create.role_label")}</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <For each={props.roles}>
              {(r) => {
                const selected = () => props.role === r.value;
                const hintKey = ROLE_HINTS[r.value];
                return (
                  <button
                    type="button"
                    onClick={() => props.setRole(r.value)}
                    class={`text-left px-3 py-2.5 rounded-lg border transition-colors
                      ${selected() ? "border-accent bg-accent/10" : "border-rim bg-surface hover:border-rim-strong"}`}
                  >
                    <span class={`block text-sm font-medium ${selected() ? "text-accent" : "text-txt"}`}>
                      {r.label}
                    </span>
                    <Show when={hintKey}>
                      <span class="block text-xs text-muted mt-0.5">{t(hintKey as any)}</span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
