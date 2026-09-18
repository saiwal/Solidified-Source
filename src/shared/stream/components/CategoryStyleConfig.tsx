import type { WidgetConfigProps } from "@utsukta/spa-core/types/module.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import StyleConfigForm from "./StyleConfigForm";

export default function CategoryStyleConfig(props: WidgetConfigProps) {
  const { t } = useI18n();
  return (
    <StyleConfigForm
      {...props}
      fallback="list"
      rainbow
      options={[
        { value: "list", label: t("widgets.style_list") },
        { value: "cloud", label: t("widgets.style_cloud") },
      ]}
    />
  );
}
