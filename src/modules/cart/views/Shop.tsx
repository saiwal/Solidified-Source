// The buyer's side of /cart: catalog, cart, placed orders and subscriptions.
import { Show, For } from 'solid-js';
import {
  MdFillShopping_cart,
  MdOutlineAdd_shopping_cart,
  MdFillRemove_shopping_cart,
  MdFillAdd,
  MdFillRemove,
  MdFillCheck_circle,
  MdFillKey,
} from 'solid-icons/md';
import {
  catalogWithQty, cartItems, cartSubtotal, isCheckedOut,
  paymentConfig, order,
  addItem, removeItem, setItemQty, myOrders, myOrdersLoading, mySubs, renewSubscription,
  setItemOptions, missingRequired,
} from '../store';
import type { Billing, Subscription } from '../api';
import { useI18n } from '@utsukta/spa-core/i18n';
import { useViewerRole } from '@utsukta/spa-core/store/site-config';
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Textarea } from "@ui/Field";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { Banner } from "@ui/Banner";
import { EmptyState } from "@ui/EmptyState";
import { PaymentOptions } from './Checkout';

// ── Billing label ─────────────────────────────────────────────────────────────

export const TERMS: Billing['term'][] = ['day', 'week', 'month', 'year'];

/** "per month" / "every 3 months"; nothing for a one-time product. */
export function useBillingText() {
  const { t } = useI18n();
  return (b?: Billing | null) =>
    !b ? '' : b.interval === 1 ? t(`cart.per_${b.term}`) : t(`cart.every_${b.term}`, { n: b.interval });
}

// ── Catalog grid ──────────────────────────────────────────────────────────────

export function CatalogGrid() {
  const { t } = useI18n();
  const billingText = useBillingText();
  const viewerRole = useViewerRole();
  return (
    <>
      <Show when={catalogWithQty().length === 0}>
        <EmptyState>{t('cart.no_items')}</EmptyState>
      </Show>
      <div class="columns-1 sm:columns-2 lg:columns-3 gap-4">
        <For each={catalogWithQty()}>
          {(item) => (
            <div class="break-inside-avoid mb-4 bg-elevated border border-rim rounded-2xl p-4 flex flex-col gap-3">
              <Show when={item.photo_url}>
                <img src={item.photo_url!} alt={item.desc}
                  class="w-full h-auto block rounded-xl bg-surface" />
              </Show>
              <div>
                <p class="font-medium text-txt text-sm leading-snug">{item.desc}</p>
                <p class="text-accent font-semibold text-sm mt-1">
                  {item.price}
                  <Show when={paymentConfig()?.currency}>
                    <span class="text-xs font-normal text-muted ml-1">{paymentConfig()!.currency}</span>
                  </Show>
                  <Show when={item.billing}>
                    <span class="text-xs font-normal text-muted ml-1">{billingText(item.billing)}</span>
                  </Show>
                  <Show when={item.tax_percent}>
                    <span class="text-xs font-normal text-muted ml-1">{t('cart.plus_tax', { pct: item.tax_percent! })}</span>
                  </Show>
                </p>
                <Show when={item.access}>
                  <Badge tone="accent" size="sm" class="mt-2">
                    <MdFillKey size={10} /> {t('cart.includes_access')}
                  </Badge>
                </Show>
              </div>
              <Show when={item.in_order === 0}
                fallback={
                  // Access is had or not had, and a subscription is one period: no quantity to step.
                  <Show when={item.access || item.billing} fallback={<QtyStepper sku={item.sku} qty={item.in_order} />}>
                    <Button variant="ghost" class="w-full" onClick={() => removeItem(item.sku)}>
                      <MdFillCheck_circle size={16} /> {t('cart.in_cart')}
                    </Button>
                  </Show>
                }
              >
                <Button class="w-full" onClick={() => viewerRole() === 'anonymous'
                    ? (window.location.href = '/login')
                    : addItem(item.sku)}>
                  <MdOutlineAdd_shopping_cart size={16} /> {t('cart.add_to_cart')}
                </Button>
              </Show>
            </div>
          )}
        </For>
      </div>
    </>
  );
}

// ── Qty stepper ───────────────────────────────────────────────────────────────

function QtyStepper(props: { sku: string; qty: number }) {
  return (
    <div class="flex items-center justify-between gap-2">
      <button
        onClick={() => setItemQty(props.sku, props.qty - 1)}
        class="w-8 h-8 rounded-lg bg-surface flex items-center justify-center
               text-txt hover:bg-rim transition-colors"
        aria-label="Decrease"
      >
        <MdFillRemove size={14} />
      </button>
      <span class="text-sm font-semibold text-txt min-w-[1.5rem] text-center">{props.qty}</span>
      <button
        onClick={() => setItemQty(props.sku, props.qty + 1)}
        class="w-8 h-8 rounded-lg bg-surface flex items-center justify-center
               text-txt hover:bg-rim transition-colors"
        aria-label="Increase"
      >
        <MdFillAdd size={14} />
      </button>
    </div>
  );
}

// ── Cart contents ─────────────────────────────────────────────────────────────

export function CartContents(props: { onBrowse: () => void }) {
  const { t } = useI18n();
  return (
    <div class="flex flex-col gap-4">
      <Show when={cartItems().length === 0}>
        <div class="text-center py-14">
          <MdFillShopping_cart size={48} class="text-subtle mx-auto mb-3" />
          <p class="text-muted text-sm mb-3">{t('cart.cart_empty')}</p>
          <button
            onClick={props.onBrowse}
            class="text-accent hover:text-accent-txt text-sm font-medium hover:underline"
          >
            {t('cart.browse_catalog')}
          </button>
        </div>
      </Show>

      <Show when={cartItems().length > 0}>
        <div class="bg-elevated border border-rim rounded-2xl divide-y divide-rim overflow-hidden">
          <For each={cartItems()}>
            {(item) => {
              const catItem = () => catalogWithQty().find(c => c.sku === item.sku);
              const answers = () => Object.fromEntries((item.options ?? []).map(o => [o.id, o.value]));
              return (
                <div class="p-4 flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <Show when={catItem()?.photo_url}
                    fallback={
                      <div class="w-11 h-11 bg-surface rounded-xl shrink-0 flex items-center justify-center">
                        <MdFillShopping_cart size={18} class="text-subtle" />
                      </div>
                    }
                  >
                    <img src={catItem()!.photo_url!} alt={item.desc}
                      class="w-11 h-11 object-contain rounded-xl shrink-0 bg-surface" />
                  </Show>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-txt truncate">{item.desc}</p>
                    <p class="text-xs text-muted mt-0.5">{item.price}<Show when={paymentConfig()?.currency}> {paymentConfig()!.currency}</Show></p>
                  </div>
                  <Show when={!catItem()?.access && !catItem()?.billing}>
                    <QtyStepper sku={item.sku} qty={item.qty} />
                  </Show>
                  <IconButton
                    label={t('cart.remove')}
                    variant="danger"
                    class="shrink-0 ml-1"
                    onClick={() => removeItem(item.sku)}
                  >
                    <MdFillRemove_shopping_cart size={20} />
                  </IconButton>
                </div>
                {/* The seller's questions about this item; saved when a field is left. */}
                <For each={isCheckedOut() ? [] : catItem()?.options ?? []}>
                  {(opt) => {
                    const save = (e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) =>
                      setItemOptions(item.sku, { ...answers(), [opt.id!]: e.currentTarget.value });
                    return (
                      <Field label={<>{opt.label}<Show when={opt.required}> *</Show></>} size="sm">
                        <Show when={opt.type === 'textarea'}
                          fallback={<Input type="text" maxLength={1000} required={opt.required} value={answers()[opt.id!] ?? ''} onChange={save} />}
                        >
                          <Textarea rows={2} maxLength={1000} required={opt.required} value={answers()[opt.id!] ?? ''} onChange={save} />
                        </Show>
                      </Field>
                    );
                  }}
                </For>
                </div>
              );
            }}
          </For>
        </div>

        <div class="bg-elevated border border-rim rounded-2xl p-4">
          <Show when={(order()?.tax_raw ?? 0) > 0}>
            <div class="flex justify-between text-xs text-muted mb-1">
              <span>{t('cart.subtotal')}</span><span>{order()!.subtotal}</span>
            </div>
            <div class="flex justify-between text-xs text-muted mb-2">
              <span>{t('cart.tax')}</span><span>{order()!.tax}</span>
            </div>
          </Show>
          <div class="flex justify-between text-sm font-semibold text-txt">
            <span>{t('cart.estimated_total')}</span>
            <span>{cartSubtotal()} <Show when={paymentConfig()?.currency}><span class="text-xs font-normal text-muted">{paymentConfig()!.currency}</span></Show></span>
          </div>
          <p class="text-xs text-muted mt-1">{t('cart.checkout_note')}</p>
        </div>

        <Show
          when={!isCheckedOut()}
          fallback={<OrderPlacedBanner paid={order()?.paid ?? false} />}
        >
          <Show when={!missingRequired()} fallback={<Banner tone="warning">{t('cart.options_missing')}</Banner>}>
            <PaymentOptions />
          </Show>
        </Show>
      </Show>
    </div>
  );
}

// ── Order placed banner ───────────────────────────────────────────────────────

function OrderPlacedBanner(props: { paid: boolean }) {
  const { t } = useI18n();
  return (
    <div class="rounded-2xl border p-5 text-center flex flex-col items-center gap-2
                bg-success-muted border-success/40">
      <MdFillCheck_circle size={32} class="text-success-txt" />
      <p class="text-sm font-semibold text-success-txt">
        {props.paid ? t('cart.payment_success') : t('cart.order_placed')}
      </p>
      <Show when={!props.paid}>
        <p class="text-xs text-success-txt">{t('cart.order_placed_note')}</p>
      </Show>
    </div>
  );
}


// ── Buyer: placed orders ──────────────────────────────────────────────────────

/** One subscription: what, until when, and the caller's actions. Shared by buyer and seller lists. */
export function SubscriptionRow(props: { sub: Subscription; title: string; subtitle?: string; children?: import('solid-js').JSX.Element }) {
  const { t } = useI18n();
  const billingText = useBillingText();
  const day = (s: string | null) => s?.slice(0, 10) ?? '';
  return (
    <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
      <div class="flex-1 min-w-40">
        <p class="text-sm font-medium text-txt truncate">{props.title}</p>
        <p class="text-xs text-muted mt-0.5">
          <Show when={props.subtitle}>{props.subtitle} · </Show>
          {billingText(props.sub.billing)}
        </p>
      </div>
      <Badge tone={props.sub.active ? 'success' : undefined} size="sm" class="shrink-0">
        {props.sub.active
          ? t('cart.subs_until', { date: day(props.sub.expires) })
          : t('cart.subs_ended', { date: day(props.sub.ended ?? props.sub.expires) })}
      </Badge>
      <div class="flex gap-1 shrink-0">{props.children}</div>
    </div>
  );
}

export function MyOrders() {
  const { t } = useI18n();
  return (
    <div class="flex flex-col gap-4">
      <Show when={!myOrdersLoading() && mySubs().length > 0}>
        <Card class="overflow-hidden">
          <p class="text-xs font-semibold text-muted uppercase tracking-wide px-4 pt-3 pb-2 border-b border-rim">
            {t('cart.subs_title')}
          </p>
          <div class="divide-y divide-rim">
            <For each={mySubs()}>
              {(sub) => (
                <SubscriptionRow sub={sub} title={sub.desc}>
                  <Show when={sub.renewable}>
                    <Button size="sm" onClick={() => renewSubscription(sub.sku)}>{t('cart.subs_renew')}</Button>
                  </Show>
                </SubscriptionRow>
              )}
            </For>
          </div>
        </Card>
      </Show>

      <Show when={myOrdersLoading()}>
        <div class="h-24 bg-elevated border border-rim rounded-2xl animate-pulse" />
      </Show>

      <Show when={!myOrdersLoading() && myOrders().length === 0}>
        <EmptyState>{t('cart.no_my_orders')}</EmptyState>
      </Show>

      <For each={myOrdersLoading() ? [] : myOrders()}>
        {(ord) => (
          <Card class="overflow-hidden">
            <div class="flex items-center justify-between gap-2 flex-wrap px-4 py-3 border-b border-rim">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-txt">
                  {ord.total} <span class="text-xs font-normal text-muted">{ord.currency}</span>
                </p>
                <p class="text-xs text-muted mt-0.5">
                  {ord.checked_out_at?.slice(0, 10)} · #{ord.hash?.slice(0, 8)}
                </p>
              </div>
              <Badge tone={ord.paid ? 'success' : 'warning'} size="sm">
                {ord.paid ? t('cart.order_paid') : t('cart.order_unpaid')}
              </Badge>
            </div>
            <div class="divide-y divide-rim">
              <For each={ord.items}>
                {(item) => (
                  <div class="flex items-center gap-3 px-4 py-2.5">
                    <p class="flex-1 min-w-0 text-sm text-txt truncate">
                      {item.desc}<Show when={item.qty > 1}> × {item.qty}</Show>
                    </p>
                    <Badge tone={item.fulfilled ? 'success' : undefined} size="sm" class="shrink-0">
                      <Show when={item.fulfilled && item.access}><MdFillKey size={10} /></Show>
                      {item.fulfilled
                        ? (item.access ? t('cart.access_granted') : t('cart.item_fulfilled'))
                        : t('cart.item_pending')}
                    </Badge>
                  </div>
                )}
              </For>
            </div>
          </Card>
        )}
      </For>
    </div>
  );
}

