import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import StyleConfigForm from "./StyleConfigForm";

export default function TagStyleConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  return (
    <StyleConfigForm
      {...props}
      fallback="cloud"
      rainbow
      options={[
        { value: "cloud", label: t("widgets.style_cloud") },
        { value: "list", label: t("widgets.style_list") },
      ]}
    />
  );
}
