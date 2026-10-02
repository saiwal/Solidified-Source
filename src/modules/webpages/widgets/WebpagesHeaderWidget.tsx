import { Show } from 'solid-js';
import { A } from '@solidjs/router';
import { usePageNick, useViewerRole } from '@utsukta/spa-core/store/site-config';
import { useI18n } from '@utsukta/spa-core/i18n';
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { useIsWebpagesList } from '../lib/isWebpagesList';

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
          <Show when={isOwner()}>
            <div class="flex items-center gap-2">
              <A
                href={`/webpages/${nick()}/menus`}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rim
                       text-txt text-sm hover:bg-elevated transition-colors"
              >
                {t('webpages.manage_menus')}
              </A>
              <A
                href={`/webpages/${nick()}/layouts`}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rim
                       text-txt text-sm hover:bg-elevated transition-colors"
              >
                {t('webpages.manage_layouts')}
              </A>
              <A
                href={`/webpages/${nick()}/blocks`}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rim
                       text-txt text-sm hover:bg-elevated transition-colors"
              >
                {t('webpages.manage_blocks')}
              </A>
              <A
                href={`/webpages/${nick()}/new`}
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent
                       text-accent-fg text-sm hover:opacity-90 transition-opacity"
              >
                + {t('webpages.new_page')}
              </A>
            </div>
          </Show>
        </div>
        <div class="border-t border-rim mt-4" />
      </div>
    </Show>
  );
}
