import { createMemo, createSignal } from 'solid-js';
import type { Subscription, SalesSummary } from './api';
import type { CatalogItem, CatalogItemInput, Order, OrderItem, SellerOrder, PaymentConfig, PaymentSettings } from './api';
import {
  fetchCatalog, fetchCatalogAll, fetchOrder,
  saveCatalogItem as apiSaveCatalogItem,
  deleteCatalogItem as apiDeleteCatalogItem,
  toggleCatalogItem as apiToggleCatalogItem,
  addItem as apiAdd, removeItem as apiRemove, setItemQty as apiSetQty,
  checkout as apiCheckout,
  fetchPaymentConfig, fetchPaymentSettings as apiFetchSettings,
  savePaymentSettings as apiSaveSettings,
  paypalCreateOrder as apiPaypalCreate, paypalCapture as apiPaypalCapture,
  razorpayCreateOrder as apiRzpCreate, razorpayVerify as apiRzpVerify,
  cashfreeCreateOrder as apiCfCreate, cashfreeVerify as apiCfVerify,
  fetchSellerOrders, fetchSellerOrder, fetchMyOrders, fetchGroups,
  setItemOptions as apiSetOptions, fetchSummary,
  fetchMySubscriptions, fetchSubscribers, manageSubscriber as apiManageSubscriber,
  markOrderPaid as apiMarkPaid, addOrderNote as apiAddNote,
  fulfillOrderItem as apiFulfill, cancelOrderItem as apiCancel,
} from './api';
import { toast } from '@utsukta/spa-core/store/toast';

// ── State ─────────────────────────────────────────────────────────────────────

const [nick, setNick]                             = createSignal('');
const [catalog, setCatalog]                       = createSignal<CatalogItem[]>([]);
const [order, setOrder]                           = createSignal<Order | null>(null);
const [loading, setLoading]                       = createSignal(false);
const [error, setError]                           = createSignal<string | null>(null);
const [paymentConfig, setPaymentConfig]           = createSignal<PaymentConfig | null>(null);
const [paymentSettings, setPaymentSettings]       = createSignal<PaymentSettings | null>(null);
const [paymentSettingsLoading, setPaymentSettingsLoading] = createSignal(false);
const [sellerOrders, setSellerOrders]             = createSignal<SellerOrder[]>([]);
const [ordersLoading, setOrdersLoading]           = createSignal(false);
const [selectedOrder, setSelectedOrder]           = createSignal<SellerOrder | null>(null);
const [orderDetailLoading, setOrderDetailLoading] = createSignal(false);
const [managedCatalog, setManagedCatalog]         = createSignal<CatalogItem[]>([]);
const [catalogManageLoading, setCatalogManageLoading] = createSignal(false);

const [myOrders, setMyOrders]                     = createSignal<Order[]>([]);
const [myOrdersLoading, setMyOrdersLoading]       = createSignal(false);
const [mySubs, setMySubs]                         = createSignal<Subscription[]>([]);
const [subscribers, setSubscribers]               = createSignal<Subscription[]>([]);
const [summary, setSummary]                       = createSignal<SalesSummary | null>(null);
const [groups, setGroups]                         = createSignal<{ hash: string; name: string }[]>([]);

export type CartTab = 'catalog' | 'cart' | 'purchases' | 'orders';
const [tab, setTab] = createSignal<CartTab>('catalog');

export function switchTab(next: CartTab) {
  if (next === 'orders') { loadSellerOrders(); loadSummary(); }
  if (next === 'purchases') loadMyOrders();
  setTab(next);
  setSelectedOrder(null);
}

// ── Derived ───────────────────────────────────────────────────────────────────

export const cartItems = createMemo<OrderItem[]>(() => order()?.items ?? []);

export const cartCount = createMemo(() =>
  cartItems().reduce((n, i) => n + i.qty, 0)
);

/** What will be charged: subtotal + tax. */
export const cartSubtotal = createMemo(() => order()?.total ?? order()?.subtotal ?? '0.00');

/** A required buyer option is still empty — the server refuses checkout until it isn't. */
export const missingRequired = createMemo(() =>
  cartItems().some(i =>
    (catalog().find(c => c.sku === i.sku)?.options ?? []).some(o =>
      o.required && !i.options?.find(v => v.id === o.id)?.value)));

export const isCheckedOut = createMemo(() => order()?.checked_out ?? false);

export const catalogWithQty = createMemo(() => {
  const qtyMap: Record<string, number> = {};
  for (const i of cartItems()) qtyMap[i.sku] = (qtyMap[i.sku] ?? 0) + i.qty;
  return catalog().map(c => ({ ...c, in_order: qtyMap[c.sku] ?? 0 }));
});

// ── Load ──────────────────────────────────────────────────────────────────────

export async function loadCatalog(nickname: string) {
  setNick(nickname);
  setLoading(true);
  setError(null);
  try {
    const [cat, ord, pc] = await Promise.all([
      fetchCatalog(nickname),
      fetchOrder(nickname),
      fetchPaymentConfig(nickname),
    ]);
    setCatalog(cat);
    setOrder(ord);
    setPaymentConfig(pc);
  } catch (err) {
    const msg = 'Failed to load store. Make sure the cart addon is enabled for this channel.';
    setError(msg);
    toast.error(msg);
    console.error('[cart] loadCatalog failed', err);
  } finally {
    setLoading(false);
  }
}

// ── Item mutations ────────────────────────────────────────────────────────────

export async function addItem(sku: string) {
  const n = nick();
  if (!n) return;
  setOrder(prev => {
    if (!prev) return prev;
    const existing = prev.items.find(i => i.sku === sku);
    const items = existing
      ? prev.items.map(i => i.sku === sku ? { ...i, qty: i.qty + 1 } : i)
      : [...prev.items, _catalogItemToOrder(sku, catalog())];
    return { ...prev, items };
  });
  try {
    setOrder(await apiAdd(n, sku));
  } catch {
    setOrder(await fetchOrder(n).catch(() => null));
  }
}

export async function removeItem(sku: string) {
  const n = nick();
  if (!n) return;
  setOrder(prev => prev ? { ...prev, items: prev.items.filter(i => i.sku !== sku) } : prev);
  try {
    setOrder(await apiRemove(n, sku));
  } catch {
    setOrder(await fetchOrder(n).catch(() => null));
  }
}

export async function setItemQty(sku: string, qty: number) {
  const n = nick();
  if (!n) return;
  if (qty <= 0) { await removeItem(sku); return; }
  setOrder(prev => prev ? { ...prev, items: prev.items.map(i => i.sku === sku ? { ...i, qty } : i) } : prev);
  try {
    setOrder(await apiSetQty(n, sku, qty));
  } catch {
    setOrder(await fetchOrder(n).catch(() => null));
  }
}

export async function setItemOptions(sku: string, options: Record<string, string>) {
  const n = nick();
  if (!n) return;
  try {
    setOrder(await apiSetOptions(n, sku, options));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save.');
  }
}

// ── Checkout ──────────────────────────────────────────────────────────────────

export async function checkout(paymentHint = '') {
  const n = nick();
  if (!n) return;
  try {
    await apiCheckout(n, paymentHint);
    setOrder(prev => prev ? { ...prev, checked_out: true } : prev);
    toast.success('Order placed! The seller will be in touch.');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Checkout failed.');
  }
}

// ── PayPal ────────────────────────────────────────────────────────────────────

export async function paypalCreateOrder(): Promise<string> {
  const n    = nick();
  const hash = order()?.hash;
  if (!n || !hash) throw new Error('No active order');
  const { paypal_order_id } = await apiPaypalCreate(n, hash);
  return paypal_order_id;
}

// ── Razorpay ──────────────────────────────────────────────────────────────────

export async function razorpayCreateOrder(): Promise<{ razorpay_order_id: string; key_id: string; amount: number; currency: string }> {
  const n    = nick();
  const hash = order()?.hash;
  if (!n || !hash) throw new Error('No active order');
  return apiRzpCreate(n, hash);
}

export async function razorpayVerify(rzpOrderId: string, rzpPaymentId: string, rzpSignature: string) {
  const n    = nick();
  const hash = order()?.hash;
  if (!n || !hash) throw new Error('No active order');
  await apiRzpVerify(n, rzpOrderId, rzpPaymentId, rzpSignature, hash);
  setOrder(prev => prev ? { ...prev, checked_out: true, paid: true } : prev);
  toast.success('Payment successful!');
}

export async function cashfreeCreateOrder(customerPhone: string): Promise<{ payment_session_id: string; mode: string }> {
  const n    = nick();
  const hash = order()?.hash;
  if (!n || !hash) throw new Error('No active order');
  return apiCfCreate(n, hash, customerPhone);
}

export async function cashfreeVerify() {
  const n    = nick();
  const hash = order()?.hash;
  if (!n || !hash) throw new Error('No active order');
  await apiCfVerify(n, hash);
  setOrder(prev => prev ? { ...prev, checked_out: true, paid: true } : prev);
  toast.success('Payment successful!');
}

export async function paypalCapture(paypalOrderId: string) {
  const n    = nick();
  const hash = order()?.hash;
  if (!n || !hash) throw new Error('No active order');
  await apiPaypalCapture(n, paypalOrderId, hash);
  setOrder(prev => prev ? { ...prev, checked_out: true, paid: true } : prev);
  toast.success('Payment successful!');
}

// ── Payment settings (seller) ─────────────────────────────────────────────────

export async function loadPaymentSettings() {
  const n = nick();
  if (!n) return;
  setPaymentSettingsLoading(true);
  try {
    setPaymentSettings(await apiFetchSettings(n));
  } catch (err) {
    toast.error('Failed to load payment settings.');
    console.error('[cart] loadPaymentSettings failed', err);
  } finally {
    setPaymentSettingsLoading(false);
  }
}

export async function savePaymentSettings(settings: PaymentSettings) {
  const n = nick();
  if (!n) return;
  try {
    const updated = await apiSaveSettings(n, settings);
    setPaymentSettings(updated);
    // Refresh public config so PayPal button appears/disappears immediately
    setPaymentConfig(await fetchPaymentConfig(n));
    toast.success('Settings saved.');
  } catch (err) {
    toast.error('Failed to save settings.');
    console.error('[cart] savePaymentSettings failed', err);
  }
}

// ── Buyer: placed orders ──────────────────────────────────────────────────────

export async function loadMyOrders() {
  const n = nick();
  if (!n) return;
  setMyOrdersLoading(true);
  try {
    const [orders, subs] = await Promise.all([fetchMyOrders(n), fetchMySubscriptions(n)]);
    setMyOrders(orders);
    setMySubs(subs);
  } catch {
    toast.error('Failed to load orders.');
  } finally {
    setMyOrdersLoading(false);
  }
}

/** Renew = buy the product again; paying extends the same subscription. */
export async function renewSubscription(sku: string) {
  await addItem(sku);
  switchTab('cart');
}

export async function loadSummary() {
  const n = nick();
  if (!n) return;
  // Decoration on the orders page: a failure just leaves the tiles out.
  setSummary(await fetchSummary(n).catch(() => null));
}

export async function loadSubscribers() {
  const n = nick();
  if (!n) return;
  try {
    setSubscribers(await fetchSubscribers(n));
  } catch {
    toast.error('Failed to load subscribers.');
  }
}

export async function manageSubscriber(id: number, action: 'extend' | 'revoke') {
  const n = nick();
  if (!n) return;
  try {
    setSubscribers(await apiManageSubscriber(n, id, action));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to update subscription.');
  }
}

/** Privacy groups for the product form's grants picker (seller). */
export async function loadGroups() {
  const n = nick();
  if (!n) return;
  try {
    setGroups(await fetchGroups(n));
  } catch {
    toast.error('Failed to load privacy groups.');
  }
}

// ── Seller order actions ──────────────────────────────────────────────────────

export async function loadSellerOrders() {
  const n = nick();
  if (!n) return;
  setOrdersLoading(true);
  try {
    setSellerOrders(await fetchSellerOrders(n));
  } catch {
    toast.error('Failed to load orders.');
  } finally {
    setOrdersLoading(false);
  }
}

export async function loadSellerOrder(hash: string) {
  const n = nick();
  if (!n) return;
  setOrderDetailLoading(true);
  try {
    setSelectedOrder(await fetchSellerOrder(n, hash));
  } catch {
    toast.error('Failed to load order.');
  } finally {
    setOrderDetailLoading(false);
  }
}

export async function markOrderPaid(hash: string) {
  const n = nick();
  if (!n) return;
  try {
    const updated = await apiMarkPaid(n, hash);
    setSelectedOrder(updated);
    setSellerOrders(prev => prev.map(o => o.hash === hash ? updated : o));
    loadSummary();
    toast.success('Order marked as paid.');
  } catch {
    toast.error('Failed to mark order paid.');
  }
}

export async function addOrderNote(hash: string, text: string) {
  const n = nick();
  if (!n || !text.trim()) return;
  try {
    setSelectedOrder(await apiAddNote(n, hash, text));
  } catch {
    toast.error('Failed to add note.');
  }
}

export async function fulfillItem(hash: string, itemId: number) {
  const n = nick();
  if (!n) return;
  try {
    setSelectedOrder(await apiFulfill(n, hash, itemId));
    toast.success('Item fulfilled.');
  } catch {
    toast.error('Failed to fulfill item.');
  }
}

export async function cancelItem(hash: string, itemId: number) {
  const n = nick();
  if (!n) return;
  try {
    setSelectedOrder(await apiCancel(n, hash, itemId));
    toast.success('Item cancelled.');
  } catch {
    toast.error('Failed to cancel item.');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _catalogItemToOrder(sku: string, cat: CatalogItem[]): OrderItem {
  const c = cat.find(i => i.sku === sku);
  return { id: 0, sku, desc: c?.desc ?? sku, qty: 1, price_raw: c?.price_raw ?? 0, price: c?.price ?? '' };
}

// ── Catalog management (seller) ───────────────────────────────────────────────

export async function loadManagedCatalog() {
  const n = nick();
  if (!n) return;
  setCatalogManageLoading(true);
  try {
    setManagedCatalog(await fetchCatalogAll(n));
  } catch {
    toast.error('Failed to load catalog.');
  } finally {
    setCatalogManageLoading(false);
  }
}

export async function saveCatalogItemAction(item: CatalogItemInput) {
  const n = nick();
  if (!n) return;
  try {
    const updated = await apiSaveCatalogItem(n, item);
    setManagedCatalog(updated);
    setCatalog(updated.filter(i => i.active !== false));
    toast.success('Item saved.');
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save item.');
  }
}

export async function deleteCatalogItemAction(sku: string) {
  const n = nick();
  if (!n) return;
  try {
    const updated = await apiDeleteCatalogItem(n, sku);
    setManagedCatalog(updated);
    setCatalog(updated.filter(i => i.active !== false));
    toast.success('Item deleted.');
  } catch {
    toast.error('Failed to delete item.');
  }
}

export async function toggleCatalogItemAction(sku: string) {
  const n = nick();
  if (!n) return;
  try {
    const updated = await apiToggleCatalogItem(n, sku);
    setManagedCatalog(updated);
    setCatalog(updated.filter(i => i.active !== false));
  } catch {
    toast.error('Failed to update item.');
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

export {
  nick, catalog, order, loading, error,
  paymentConfig, paymentSettings, paymentSettingsLoading,
  sellerOrders, ordersLoading, selectedOrder, orderDetailLoading,
  setSelectedOrder,
  managedCatalog, catalogManageLoading,
  myOrders, myOrdersLoading, groups, mySubs, subscribers, summary,
  tab,
};
