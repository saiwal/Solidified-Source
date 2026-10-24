import { MdOutlinePerson_add } from "solid-icons/md";
import { useManageData } from "../store";
import { useI18n } from "@utsukta/spa-core/i18n";
import PageActions from "@/shared/views/layout/PageActions";

export default function ManageHeaderWidget() {
  const { t } = useI18n();
  const data = useManageData();

  return (
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">{t("manage.channels")}</h1>
      <PageActions actions={[
        { label: t("manage.new_channel"), icon: MdOutlinePerson_add, href: data()?.create_url ?? "/new_channel", primary: true },
      ]} />
    </div>
  );
}
