import { apiFetch } from '@utsukta/spa-core/lib/fetch';

/** What an access product hands its buyer. `groups` are privacy-group hashes. */
export interface Grants {
  groups: string[];
  connect: boolean;
}

/** Recurring billing: one paid order buys one period. */
export interface Billing {
  interval: number;
  term: 'day' | 'week' | 'month' | 'year';
}

/** A question the seller asks the buyer about an item ("Name to engrave"). */
export interface ProductOption {
  /** Issued by the server; omit for a new one. */
  id?: string;
  label: string;
  type: 'text' | 'textarea';
  required: boolean;
}

export interface SalesSummary {
  orders: number;
  unpaid: number;
  to_fulfil: number;
  subscribers: number;
  /** One entry per currency — never summed across. */
  revenue: { currency: string; amount: string }[];
}

export interface Subscription {
  id: number;
  sku: string;
  desc: string;
  active: boolean;
  /** UTC "Y-m-d H:i:s"; kept after it ends as the record of the paid period. */
  expires: string | null;
  ended: string | null;
  reason: 'expired' | 'cancelled' | null;
  billing: Billing | null;
  renewable: boolean;
  // seller-only
  buyer?: string;
  buyer_name?: string;
}

export interface CatalogItem {
  sku: string;
  desc: string;
  price_raw: number;
  price: string;
  photo_url: string | null;
  type: string;
  active?: boolean;
  /** Buying it grants access (group membership / a connection). */
  access?: boolean;
  /** Seller's catalog (?all=1) only. */
  grants?: Grants;
  billing?: Billing | null;
  /** Added on top of the price. */
  tax_percent?: number;
  options?: ProductOption[];
}

export interface CatalogItemInput {
  sku?: string;
  description: string;
  price: number;
  photo_url?: string;
  active?: boolean;
  grants?: Grants;
  /** null = one-time. */
  billing?: Billing | null;
  tax_percent?: number;
  options?: ProductOption[];
}

export interface OrderItem {
  id: number;
  sku: string;
  desc: string;
  qty: number;
  price_raw: number;
  price: string;
  type?: string;
  access?: boolean;
  /** The buyer's answers to the product's options. */
  options?: { id: string; label: string; value: string }[];
  fulfilled?: boolean;
  // seller-only
  confirmed?: boolean;
  exception?: boolean;
  notes?: string[];
}

export interface Order {
  hash: string | null;
  items: OrderItem[];
  subtotal_raw: number;
  subtotal: string;
  tax_raw: number;
  tax: string;
  /** subtotal + tax: what is charged. */
  total_raw: number;
  total: string;
  currency: string;
  checked_out: boolean;
  paid: boolean;
  checked_out_at?: string | null;
  paid_at?: string | null;
}

export interface SellerOrder extends Order {
  buyer: string;
  buyer_name: string;
  payment: { provider: string; txn_id: string } | null;
  flags: { confirmed: boolean; fulfilled: boolean; exception: boolean };
  notes: string[];
}

export interface PaymentProvider {
  id: string;
  label: string;
  enabled: boolean;
  // PayPal
  client_id?: string;
  // Razorpay
  key_id?: string;
  currency?: string;
  // Cashfree
  app_id?: string;
  mode?: 'sandbox' | 'production';
  // UPI
  upi_id?: string;
  display_name?: string;
}

export interface PaymentConfig {
  providers: PaymentProvider[];
  currency: string;
}

export interface PaymentSettings {
  currency: string;
  paypal: {
    enabled: boolean;
    client_id: string;
    secret: string;
    mode: 'sandbox' | 'live';
  };
  razorpay: {
    enabled: boolean;
    key_id: string;
    key_secret: string;
    currency: string;
  };
  cashfree: {
    enabled: boolean;
    app_id: string;
    secret_key: string;
    mode: 'sandbox' | 'production';
  };
  upi: {
    enabled: boolean;
    upi_id: string;
    display_name: string;
  };
  manual: {
    enabled: boolean;
    instructions: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function cartGet<T>(path: string): Promise<T> {
  const res = await apiFetch(`/spa/cart/${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Cart error ${res.status}`);
  }
  return (await res.json()).data as T;
}

async function cartPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await apiFetch(`/spa/cart/${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `Cart error ${res.status}`);
  }
  return (await res.json()).data as T;
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export const fetchCatalog = (nick: string) =>
  cartGet<CatalogItem[]>(`${nick}/catalog`);

export const fetchCatalogAll = (nick: string) =>
  cartGet<CatalogItem[]>(`${nick}/catalog?all=1`);

export const saveCatalogItem = (nick: string, item: CatalogItemInput) =>
  cartPost<CatalogItem[]>(`${nick}/catalog`, item as unknown as Record<string, unknown>);

export const deleteCatalogItem = (nick: string, sku: string) =>
  cartPost<CatalogItem[]>(`${nick}/catalog/delete`, { sku });

export const toggleCatalogItem = (nick: string, sku: string) =>
  cartPost<CatalogItem[]>(`${nick}/catalog/toggle`, { sku });

// ── Order ─────────────────────────────────────────────────────────────────────

export const fetchOrder = (nick: string) =>
  cartGet<Order>(`${nick}/order`);

export const addItem = (nick: string, sku: string, qty = 1) =>
  cartPost<Order>(`${nick}/item`, { sku, qty });

export const removeItem = (nick: string, sku: string) =>
  cartPost<Order>(`${nick}/item/remove`, { sku });

export const setItemQty = (nick: string, sku: string, qty: number) =>
  cartPost<Order>(`${nick}/item/qty`, { sku, qty });

export const checkout = (nick: string, paymentHint = '') =>
  cartPost<{ checked_out: boolean; order_hash: string }>(`${nick}/checkout`, { payment_hint: paymentHint });

export const setItemOptions = (nick: string, sku: string, options: Record<string, string>) =>
  cartPost<Order>(`${nick}/item/options`, { sku, options });

export const fetchSummary = (nick: string) =>
  cartGet<SalesSummary>(`${nick}/summary`);

export const fetchMyOrders = (nick: string) =>
  cartGet<Order[]>(`${nick}/my-orders`);

export const fetchGroups = (nick: string) =>
  cartGet<{ hash: string; name: string }[]>(`${nick}/groups`);

export const fetchMySubscriptions = (nick: string) =>
  cartGet<Subscription[]>(`${nick}/my-subscriptions`);

export const fetchSubscribers = (nick: string) =>
  cartGet<Subscription[]>(`${nick}/subscribers`);

export const manageSubscriber = (nick: string, id: number, action: 'extend' | 'revoke') =>
  cartPost<Subscription[]>(`${nick}/subscribers/${id}/${action}`);

// ── Payment ───────────────────────────────────────────────────────────────────

export const fetchPaymentConfig = (nick: string) =>
  cartGet<PaymentConfig>(`${nick}/payment-config`);

export const fetchPaymentSettings = (nick: string) =>
  cartGet<PaymentSettings>(`${nick}/payment-settings`);

export const savePaymentSettings = (nick: string, settings: Partial<PaymentSettings>) =>
  cartPost<PaymentSettings>(`${nick}/payment-settings`, settings as Record<string, unknown>);

export const paypalCreateOrder = (nick: string, orderHash: string) =>
  cartPost<{ paypal_order_id: string }>(`${nick}/paypal/create-order`, { order_hash: orderHash });

export const paypalCapture = (nick: string, paypalOrderId: string, orderHash: string) =>
  cartPost<{ paid: boolean; order_hash: string; txn_id: string }>(
    `${nick}/paypal/capture`,
    { paypal_order_id: paypalOrderId, order_hash: orderHash }
  );

export const razorpayCreateOrder = (nick: string, orderHash: string) =>
  cartPost<{ razorpay_order_id: string; key_id: string; amount: number; currency: string }>(
    `${nick}/razorpay/create-order`, { order_hash: orderHash }
  );

export const cashfreeCreateOrder = (nick: string, orderHash: string, customerPhone: string) =>
  cartPost<{ payment_session_id: string; mode: string }>(
    `${nick}/cashfree/create-order`, { order_hash: orderHash, customer_phone: customerPhone }
  );

export const cashfreeVerify = (nick: string, orderHash: string) =>
  cartPost<{ paid: boolean; order_hash: string; txn_id: string }>(
    `${nick}/cashfree/verify`, { order_hash: orderHash }
  );

export const razorpayVerify = (
  nick: string,
  rzpOrderId: string,
  rzpPaymentId: string,
  rzpSignature: string,
  orderHash: string,
) =>
  cartPost<{ paid: boolean; order_hash: string; txn_id: string }>(
    `${nick}/razorpay/verify`,
    { razorpay_order_id: rzpOrderId, razorpay_payment_id: rzpPaymentId,
      razorpay_signature: rzpSignature, order_hash: orderHash }
  );

// ── Seller orders ─────────────────────────────────────────────────────────────

export const fetchSellerOrders = (nick: string) =>
  cartGet<SellerOrder[]>(`${nick}/orders`);

export const fetchSellerOrder = (nick: string, hash: string) =>
  cartGet<SellerOrder>(`${nick}/orders/${hash}`);

export const markOrderPaid = (nick: string, hash: string) =>
  cartPost<SellerOrder>(`${nick}/orders/${hash}/markpaid`);

export const addOrderNote = (nick: string, hash: string, text: string) =>
  cartPost<SellerOrder>(`${nick}/orders/${hash}/note`, { text });

export const fulfillOrderItem = (nick: string, hash: string, itemId: number) =>
  cartPost<SellerOrder>(`${nick}/orders/${hash}/items/${itemId}/fulfill`);

export const cancelOrderItem = (nick: string, hash: string, itemId: number) =>
  cartPost<SellerOrder>(`${nick}/orders/${hash}/items/${itemId}/cancel`);
