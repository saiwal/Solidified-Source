import { Show } from "solid-js";
import type { ChannelRole } from "../../api/api";
import { THEMES, type ThemeId } from "@utsukta/spa-core/types/theme.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

export default function ReviewStep(props: {
  name: string;
  nickname: string;
  nickhub: string;
  role: string;
  roles: ChannelRole[];
  protocols: string[];
  integrations: string[];
  colorScheme: ThemeId;
}) {
  const { t } = useI18n();

  const roleLabel = () => props.roles.find((r) => r.value === props.role)?.label ?? props.role;
  const schemeLabel = () => THEMES.find((th) => th.id === props.colorScheme)?.label ?? props.colorScheme;

  const Row = (p: { label: string; value: string }) => (
    <div class="flex items-center justify-between py-2 border-b border-rim last:border-0">
      <span class="text-xs text-muted">{p.label}</span>
      <span class="text-sm text-txt font-medium text-right">{p.value}</span>
    </div>
  );

  return (
    <div class="space-y-4">
      <p class="text-sm text-muted">{t("channel_create.review_desc")}</p>

      <Card class="px-3">
        <Row label={t("channel_create.name_label")} value={props.name} />
        <Row label={t("channel_create.nick_label")} value={`${props.nickname}${props.nickhub}`} />
        <Show when={props.role}>
          <Row label={t("channel_create.role_label")} value={roleLabel()} />
        </Show>
        <Row
          label={t("channel_create.protocols_review_label")}
          value={
            props.protocols.length > 0
              ? props.protocols.join(", ")
              : t("channel_create.protocols_none")
          }
        />
        <Row
          label={t("channel_create.integrations_review_label")}
          value={
            props.integrations.length > 0
              ? props.integrations.join(", ")
              : t("channel_create.integrations_none")
          }
        />
        <Row label={t("channel_create.color_scheme_label")} value={schemeLabel()} />
      </Card>
    </div>
  );
}
