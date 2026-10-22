import { Show, For } from 'solid-js';
import { A } from '@solidjs/router';
import { MdFillShopping_cart, MdFillStore, MdFillReceipt_long } from 'solid-icons/md';
import { cartCount, cartItems, nick, sellerOrders } from '../store';
import { useI18n } from '@utsukta/spa-core/i18n';
import { useViewerRole } from '@utsukta/spa-core/store/site-config';
import { Badge } from "@ui/Badge";

export default function CartWidget() {
  const { t } = useI18n();
  const viewerRole = useViewerRole();
  const isOwner = () => viewerRole() === 'owner';

  const unpaidCount = () => sellerOrders().filter(o => !o.paid).length;
  const unfulfilledCount = () => sellerOrders().filter(o => !o.flags?.fulfilled).length;

  return (
    <>
      {/* Buyer cart summary */}
      <Show when={cartCount() > 0}>
        <div class="bg-elevated border border-rim rounded-2xl p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <MdFillShopping_cart size={18} class="text-accent" />
              <span class="text-sm font-semibold text-txt">{t('cart.cart_label')}</span>
            </div>
            <Badge tone="accent">
              {cartCount()} {cartCount() === 1 ? t('cart.item_singular') : t('cart.item_plural')}
            </Badge>
          </div>

          <div class="flex flex-col gap-1">
            <Show
              when={cartItems().length > 0}
              fallback={<p class="text-xs text-muted">{t('cart.no_items_yet')}</p>}
            >
              <For each={cartItems().slice(0, 3)}>
                {(item) => (
                  <div class="flex items-center justify-between text-xs gap-2">
                    <span class="truncate text-muted">{item.desc}</span>
                    <span class="shrink-0 text-muted">×{item.qty}</span>
                  </div>
                )}
              </For>
              <Show when={cartItems().length > 3}>
                <p class="text-xs text-muted">+{cartItems().length - 3} more</p>
              </Show>
            </Show>
          </div>

          <A
            href={`/cart/${nick()}`}
            class="text-center text-xs font-medium text-accent hover:text-accent-txt transition-colors"
          >
            {t('cart.view_cart')}
          </A>
        </div>
      </Show>

      {/* Seller shop summary */}
      <Show when={isOwner() && sellerOrders().length > 0}>
        <div class="bg-elevated border border-rim rounded-2xl p-4 flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <MdFillStore size={18} class="text-accent" />
            <span class="text-sm font-semibold text-txt">{t('cart.orders_tab')}</span>
          </div>

          <div class="flex flex-col gap-1">
            <Show when={unpaidCount() > 0}>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted flex items-center gap-1">
                  <MdFillReceipt_long size={12} /> {t('cart.order_unpaid')}
                </span>
                <span class="font-semibold text-warning-txt">{unpaidCount()}</span>
              </div>
            </Show>
            <Show when={unfulfilledCount() > 0}>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted">{t('cart.order_pending')}</span>
                <span class="font-semibold text-txt">{unfulfilledCount()}</span>
              </div>
            </Show>
          </div>

          <A
            href={`/cart/${nick()}`}
            class="text-center text-xs font-medium text-accent hover:text-accent-txt transition-colors"
          >
            {t('cart.orders_tab')} →
          </A>
        </div>
      </Show>
    </>
  );
}
