import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import StyleConfigForm from "./StyleConfigForm";

export default function ArchiveStyleConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  return (
    <StyleConfigForm
      {...props}
      fallback="list"
      options={[
        { value: "list", label: t("widgets.style_list") },
        { value: "calendar", label: t("widgets.style_calendar") },
      ]}
    />
  );
}
