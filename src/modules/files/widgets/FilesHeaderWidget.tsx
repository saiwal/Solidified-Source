import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";

export default function FilesHeaderWidget() {
  const { t } = useI18n();
  const owner = usePageOwnerName();
  return (
    <div class="max-w-5xl mx-auto flex items-center gap-3">
      <h1 class="text-lg font-semibold text-txt">
        {owner() === null ? t("files_mod.title_mine") : t("files_mod.title_of", { name: owner()! })}
      </h1>
    </div>
  );
}
