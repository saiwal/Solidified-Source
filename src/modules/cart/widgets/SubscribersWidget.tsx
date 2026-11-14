import { For, Show, createMemo } from 'solid-js';
import { A } from '@solidjs/router';
import { MdFillGroup } from 'solid-icons/md';
import { useI18n } from '@utsukta/spa-core/i18n';
import { usePageNick, useViewerRole } from '@utsukta/spa-core/store/site-config';
import { createQueryResource } from '@utsukta/spa-core/lib/createQueryResource';
import { WidgetShell } from '@ui/WidgetShell';
import { CountBadge } from '@ui/Badge';
import { EmptyState } from '@ui/EmptyState';
import { fetchSubscribers } from '../api';

/** The shop owner's live subscribers, soonest to run out first. Owner only. */
export default function SubscribersWidget() {
  const { t } = useI18n();
  const pageNick = usePageNick();
  const role = useViewerRole();

  const [subs] = createQueryResource(
    'cart-subscribers',
    () => role() === 'owner' && pageNick(),
    (n: string) => fetchSubscribers(n).catch(() => []),
  );
  const active = createMemo(() =>
    (subs() ?? []).filter(s => s.active).sort((a, b) => (a.expires ?? '').localeCompare(b.expires ?? '')));

  return (
    <Show when={role() === 'owner'}>
      <WidgetShell
        icon={<MdFillGroup size={16} class="text-accent" />}
        title={t('cart.subscribers')}
        actions={<CountBadge n={active().length} />}
        footer={
          <A href={`/cart/${pageNick()}`} class="mx-auto font-medium text-accent hover:text-accent-txt transition-colors">
            {t('cart.orders_tab')} →
          </A>
        }
      >
        <Show when={active().length > 0} fallback={<EmptyState size="sm">{t('cart.no_subscribers')}</EmptyState>}>
          <ul class="px-(--ws-px) py-3 flex flex-col gap-2">
            <For each={active().slice(0, 6)}>
              {(sub) => (
                <li class="flex items-baseline justify-between gap-2 text-xs">
                  <span class="min-w-0 truncate text-txt" title={sub.desc}>{sub.buyer_name || sub.buyer}</span>
                  <span class="shrink-0 text-muted tabular-nums">{sub.expires?.slice(0, 10)}</span>
                </li>
              )}
            </For>
            <Show when={active().length > 6}>
              <li class="text-xs text-muted">+{active().length - 6}</li>
            </Show>
          </ul>
        </Show>
      </WidgetShell>
    </Show>
  );
}
