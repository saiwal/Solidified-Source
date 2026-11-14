// Payment methods offered under the cart: PayPal, Razorpay, Cashfree, UPI, contact-seller.
import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import {
  cartSubtotal, paymentConfig, order,
  checkout,
  paypalCreateOrder, paypalCapture,
  razorpayCreateOrder, razorpayVerify,
  cashfreeCreateOrder, cashfreeVerify,
} from '../store';
import { useI18n } from '@utsukta/spa-core/i18n';
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";


// ── Payment options ───────────────────────────────────────────────────────────

export function PaymentOptions() {
  const { t } = useI18n();
  const providers = () => paymentConfig()?.providers ?? [];
  const has = (id: string) => providers().some(p => p.id === id && p.enabled);

  const hasAnyGateway = () => has('paypal') || has('razorpay') || has('cashfree') || has('upi');

  return (
    <div class="bg-elevated border border-rim rounded-2xl p-4 flex flex-col gap-4">
      <p class="text-xs font-semibold text-muted uppercase tracking-wide">
        {t('cart.payment_options')}
      </p>

      <Show when={has('paypal')}>
        <div class="flex flex-col gap-2">
          <p class="text-xs text-muted">{t('cart.pay_with_paypal')}</p>
          <PayPalButton />
        </div>
      </Show>

      <Show when={has('razorpay')}>
        <RazorpayButton provider={providers().find(p => p.id === 'razorpay')!} />
      </Show>

      <Show when={has('cashfree')}>
        <CashfreeButton provider={providers().find(p => p.id === 'cashfree')!} />
      </Show>

      <Show when={has('upi')}>
        <UpiPayment provider={providers().find(p => p.id === 'upi')!} />
      </Show>

      <Show when={hasAnyGateway()}>
        <div class="flex items-center gap-3 text-xs text-subtle">
          <span class="flex-1 h-px bg-rim" />
          <span>or</span>
          <span class="flex-1 h-px bg-rim" />
        </div>
      </Show>

      <button
        onClick={() => checkout()}
        class="w-full py-2.5 rounded-xl border border-rim text-sm font-medium text-muted
               hover:bg-surface hover:text-txt transition-colors"
      >
        {t('cart.contact_seller')}
      </button>
    </div>
  );
}

// ── PayPal button ─────────────────────────────────────────────────────────────

function PayPalButton() {
  let container!: HTMLDivElement;
  const { t } = useI18n();
  const [sdkError, setSdkError] = createSignal(false);

  onMount(() => {
    const config = paymentConfig();
    const ppProvider = config?.providers.find(p => p.id === 'paypal');
    if (!ppProvider?.client_id) return;

    const currency = config?.currency ?? 'USD';

    loadPayPalSdk(ppProvider.client_id, currency)
      .then(() => {
        const w = window as any;
        if (!w.paypal || !container) return;
        w.paypal.Buttons({
          createOrder: () => paypalCreateOrder(),
          onApprove: (data: { orderID: string }) => paypalCapture(data.orderID),
          onError: () => setSdkError(true),
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' },
        }).render(container);
      })
      .catch(() => setSdkError(true));
  });

  onCleanup(() => {
    // PayPal cleans up when container is removed from DOM
    if (container) container.innerHTML = '';
  });

  return (
    <Show when={!sdkError()} fallback={
      <p class="text-xs text-danger-txt py-2 text-center">{t('cart.payment_failed')}</p>
    }>
      <div ref={container!} class="min-h-[50px]" />
    </Show>
  );
}

function loadPayPalSdk(clientId: string, currency: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('paypal-sdk-script');
    if (existing) {
      // Script tag exists — either loaded or loading
      if ((window as any).paypal) { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id  = 'paypal-sdk-script';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', reject);
    document.head.appendChild(script);
  });
}

// ── Razorpay button ───────────────────────────────────────────────────────────

function RazorpayButton(_props: { provider: import('../api').PaymentProvider }) {
  const { t } = useI18n();
  const [loading, setLoading] = createSignal(false);
  const [err, setErr]         = createSignal(false);

  const pay = async () => {
    setLoading(true);
    setErr(false);
    try {
      const rzpData = await razorpayCreateOrder();
      await loadRazorpaySdk();
      const w = window as any;
      if (!w.Razorpay) throw new Error('Razorpay SDK unavailable');

      await new Promise<void>((resolve, reject) => {
        const rzp = new w.Razorpay({
          key:          rzpData.key_id,
          amount:       rzpData.amount,
          currency:     rzpData.currency,
          order_id:     rzpData.razorpay_order_id,
          name:         'Store',
          description:  'Order payment',
          handler: async (res: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              await razorpayVerify(res.razorpay_order_id, res.razorpay_payment_id, res.razorpay_signature);
              resolve();
            } catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(new Error('dismissed')) },
          theme: { color: '#6366f1' },
        });
        rzp.open();
      });
    } catch (e: any) {
      if (e?.message !== 'dismissed') setErr(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex flex-col gap-1">
      <button
        onClick={pay}
        disabled={loading()}
        class="w-full py-2.5 rounded-xl bg-[#072654] text-white text-sm font-medium
               hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
      >
        <Show when={loading()} fallback={<>
          <img src="https://razorpay.com/favicon.ico" alt="" class="w-4 h-4" />
          {t('cart.pay_with_razorpay')}
        </>}>
          {t('cart.payment_processing')}
        </Show>
      </button>
      <Show when={err()}>
        <p class="text-xs text-danger-txt text-center">{t('cart.payment_failed')}</p>
      </Show>
    </div>
  );
}

function loadRazorpaySdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('razorpay-sdk-script');
    if (existing) {
      if ((window as any).Razorpay) { resolve(); return; }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id  = 'razorpay-sdk-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', reject);
    document.head.appendChild(script);
  });
}

// ── Cashfree button ───────────────────────────────────────────────────────────

function CashfreeButton(_props: { provider: import('../api').PaymentProvider }) {
  const { t } = useI18n();
  const [phone, setPhone]     = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [err, setErr]         = createSignal<string | null>(null);

  const pay = async () => {
    const p = phone().replace(/\D/g, '');
    if (p.length < 10) { setErr(t('cart.cashfree_phone_required')); return; }
    setLoading(true);
    setErr(null);
    try {
      const { payment_session_id, mode } = await cashfreeCreateOrder(p);
      await loadCashfreeSdk();
      const cf = (window as any).Cashfree({ mode });
      const result = await cf.checkout({
        paymentSessionId: payment_session_id,
        redirectTarget: '_modal',
      });
      if (result.error) {
        setErr(result.error.message ?? t('cart.payment_failed'));
      } else {
        await cashfreeVerify();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('cart.payment_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex flex-col gap-2">
      <Input
        type="tel"
        placeholder={t('cart.cashfree_phone_placeholder')}
        value={phone()}
        onInput={e => setPhone(e.currentTarget.value)}
      />
      <Show when={err()}>
        <p class="text-xs text-danger-txt">{err()}</p>
      </Show>
      <button
        onClick={pay}
        disabled={loading()}
        class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50
               text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
      >
        {loading() ? t('cart.payment_processing') : t('cart.pay_with_cashfree')}
      </button>
    </div>
  );
}

function loadCashfreeSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Cashfree) { resolve(); return; }
    if (document.getElementById('cashfree-sdk-script')) {
      const existing = document.getElementById('cashfree-sdk-script')!;
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id  = 'cashfree-sdk-script';
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', reject);
    document.head.appendChild(script);
  });
}

// ── UPI payment ───────────────────────────────────────────────────────────────

function UpiPayment(props: { provider: import('../api').PaymentProvider }) {
  const { t } = useI18n();
  const subtotal = cartSubtotal;
  const currency = () => paymentConfig()?.currency ?? 'INR';
  const orderHash = () => order()?.hash ?? '';

  const upiUri = () => {
    const pa = encodeURIComponent(props.provider.upi_id ?? '');
    const pn = encodeURIComponent(props.provider.display_name ?? 'Seller');
    const am = encodeURIComponent(subtotal().replace(',', ''));
    const tn = encodeURIComponent('Order ' + orderHash().slice(0, 8));
    return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${currency()}&tn=${tn}`;
  };

  const copyUpiId = () => {
    navigator.clipboard?.writeText(props.provider.upi_id ?? '').catch(() => {});
  };

  return (
    <Card class="flex flex-col gap-3 p-3">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium text-txt">{t('cart.pay_via_upi')}</p>
        <span class="text-xs text-muted">{subtotal()} {currency()}</span>
      </div>

      <div class="flex items-center gap-2 px-3 py-2 bg-elevated rounded-lg">
        <span class="text-xs font-mono text-txt flex-1">{props.provider.upi_id}</span>
        <button onClick={copyUpiId} class="text-xs text-accent hover:underline shrink-0">
          {t('cart.copy')}
        </button>
      </div>

      {/* App deep links */}
      <div class="flex gap-2">
        <a href={upiUri()} class="flex-1 py-2 rounded-lg text-center text-xs font-medium
                                  bg-[#4CAF50] text-white hover:opacity-90 transition-opacity">
          GPay
        </a>
        <a href={`phonepe://${upiUri().slice(6)}`}
           class="flex-1 py-2 rounded-lg text-center text-xs font-medium
                  bg-[#5f259f] text-white hover:opacity-90 transition-opacity">
          PhonePe
        </a>
        <a href={`paytmmp://${upiUri().slice(6)}`}
           class="flex-1 py-2 rounded-lg text-center text-xs font-medium
                  bg-[#00B9F1] text-white hover:opacity-90 transition-opacity">
          Paytm
        </a>
        <a href={upiUri()} class="flex-1 py-2 rounded-lg text-center text-xs font-medium
                                  bg-elevated border border-rim text-muted hover:text-txt transition-colors">
          {t('cart.upi_any_app')}
        </a>
      </div>

      <p class="text-xs text-subtle text-center">{t('cart.upi_confirm_note')}</p>

      <button
        onClick={() => checkout(`Buyer claimed UPI payment to ${props.provider.upi_id}`)}
        class="w-full py-2 rounded-xl bg-success hover:bg-success/85 text-success-fg
               text-sm font-medium transition-colors"
      >
        {t('cart.i_have_paid')}
      </button>
    </Card>
  );
}

