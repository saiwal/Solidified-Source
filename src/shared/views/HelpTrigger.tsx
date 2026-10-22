// src/shared/views/HelpTrigger.tsx
import { useHelpMode } from "@utsukta/spa-core/store/help-mode";
import { MdFillLive_help } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { IconButton } from "@ui/Button";

export default function HelpTrigger() {
  const { t } = useI18n();
  const { helpMode, enter, exit } = useHelpMode();
  return (
    <IconButton
      label={t("ui.help_mode")}
      pressed={helpMode()}
      class="px-[12px] py-[8px]"
      onClick={() => helpMode() ? exit() : enter()}
    >
    <MdFillLive_help size={17}/>
    </IconButton>
  );
}
