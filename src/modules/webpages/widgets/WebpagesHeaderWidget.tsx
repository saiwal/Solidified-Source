import { Show } from 'solid-js';
import { MdOutlineAdd, MdOutlineDashboard, MdOutlineMenu, MdOutlineWidgets } from 'solid-icons/md';
import { usePageNick, useViewerRole } from '@utsukta/spa-core/store/site-config';
import { useI18n } from '@utsukta/spa-core/i18n';
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { useIsWebpagesList } from '../lib/isWebpagesList';
import PageActions from "@/shared/views/layout/PageActions";

export default function WebpagesHeaderWidget() {
  const { t } = useI18n();
  const owner = usePageOwnerName();
  const nick = usePageNick();
  const isList = useIsWebpagesList();
  const viewerRole = useViewerRole();
  const isOwner = () => viewerRole() === 'owner';

  return (
    <Show when={isList()}>
      <div class="max-w-5xl mx-auto px-4 md:px-6 pt-6">
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-lg font-semibold text-txt">{owner() === null ? t("webpages.title_mine") : t("webpages.title_of", { name: owner()! })}</h1>
          <PageActions actions={[
            { label: t('webpages.new_page'), icon: MdOutlineAdd, href: `/webpages/${nick()}/new`, primary: true, show: isOwner() },
            { label: t('webpages.manage_menus'), icon: MdOutlineMenu, href: `/webpages/${nick()}/menus`, overflow: true, show: isOwner() },
            { label: t('webpages.manage_layouts'), icon: MdOutlineDashboard, href: `/webpages/${nick()}/layouts`, overflow: true, show: isOwner() },
            { label: t('webpages.manage_blocks'), icon: MdOutlineWidgets, href: `/webpages/${nick()}/blocks`, overflow: true, show: isOwner() },
          ]} />
        </div>
        <div class="border-t border-rim mt-4" />
      </div>
    </Show>
  );
}
