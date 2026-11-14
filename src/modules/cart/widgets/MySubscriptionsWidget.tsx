import { For, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { MdFillAutorenew } from 'solid-icons/md';
import { useI18n } from '@utsukta/spa-core/i18n';
import { usePageNick, useViewerRole } from '@utsukta/spa-core/store/site-config';
import { createQueryResource } from '@utsukta/spa-core/lib/createQueryResource';
import { WidgetShell } from '@ui/WidgetShell';
import { Button } from '@ui/Button';
import { fetchMySubscriptions } from '../api';
import { nick as shopNick, renewSubscription } from '../store';

/**
 * The viewer's own subscriptions at the shop of the page they are on.
 * Renders nothing for the owner, for anonymous visitors, and for anyone who
 * has never subscribed here — it only takes sidebar room when it has
 * something to say.
 */
export default function MySubscriptionsWidget() {
  const { t } = useI18n();
  const pageNick = usePageNick();
  const role = useViewerRole();
  const navigate = useNavigate();

  const [subs] = createQueryResource(
    'cart-my-subscriptions',
    () => (role() === 'local' || role() === 'remote') && pageNick(),
    (n: string) => fetchMySubscriptions(n).catch(() => []),
  );

  // On the shop page the store is live: put it in the cart there and then.
  const renew = (sku: string) =>
    shopNick() === pageNick() ? renewSubscription(sku) : navigate(`/cart/${pageNick()}`);

  return (
    <Show when={subs()?.length}>
      <WidgetShell icon={<MdFillAutorenew size={16} class="text-accent" />} title={t('cart.subs_title')}>
        <ul class="px-(--ws-px) py-3 flex flex-col gap-2.5">
          <For each={subs()}>
            {(sub) => (
              <li class="flex items-center gap-2">
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-txt truncate">{sub.desc}</p>
                  <p class={`text-xs ${sub.active ? 'text-success-txt' : 'text-muted'}`}>
                    {sub.active
                      ? t('cart.subs_until', { date: sub.expires?.slice(0, 10) ?? '' })
                      : t('cart.subs_ended', { date: (sub.ended ?? sub.expires)?.slice(0, 10) ?? '' })}
                  </p>
                </div>
                <Show when={sub.renewable}>
                  <Button size="sm" variant={sub.active ? 'ghost' : undefined} class="shrink-0" onClick={() => renew(sub.sku)}>
                    {t('cart.subs_renew')}
                  </Button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </WidgetShell>
    </Show>
  );
}
