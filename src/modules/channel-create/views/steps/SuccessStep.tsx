import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";

export default function SuccessStep(props: { name: string; nick: string }) {
  const { t } = useI18n();

  return (
    <div class="text-center space-y-4 py-4">
      <div class="text-4xl">🎉</div>
      <h2 class="text-lg font-semibold text-txt">
        {t("channel_create.success_title", { name: props.name })}
      </h2>
      <p class="text-sm text-muted">{t("channel_create.success_desc")}</p>

      <div class="flex flex-col gap-2 pt-2 max-w-xs mx-auto">
        <Button class="w-full" onClick={() => (window.location.href = "/hq")}>
          {t("channel_create.success_go_hq")}
        </Button>
        <Button variant="ghost" class="w-full" onClick={() => (window.location.href = "/settings/profile")}>
          {t("channel_create.success_edit_profile")}
        </Button>
      </div>
    </div>
  );
}
