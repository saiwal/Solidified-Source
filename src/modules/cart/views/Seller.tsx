// The owner's side of /cart ("My Shop"): orders, products, subscribers, payment settings.
import { createEffect, createSignal, onMount, Show, For } from 'solid-js';
import {
  MdFillShopping_cart,
  MdFillAdd,
  MdFillReceipt_long,
  MdFillError,
  MdFillSettings,
  MdFillEdit,
  MdFillDelete,
  MdFillFormat_list_bulleted,
  MdFillToggle_on,
  MdFillToggle_off,
  MdFillImage,
  MdFillPhoto_library,
  MdFillArrow_back,
  MdFillKey,
  MdFillGroup,
} from 'solid-icons/md';
import { wallUpload } from '@/modules/files/api';
import { fetchAlbums, fetchPhotoAlbum, variantSrc } from '@/modules/photos/api/api';
import type { Album, Photo } from '@/modules/photos/api/api';
import { toast } from '@utsukta/spa-core/store/toast';
import {
  nick, paymentConfig, paymentSettings, paymentSettingsLoading, loadPaymentSettings, savePaymentSettings,
  sellerOrders, ordersLoading, selectedOrder, orderDetailLoading,
  loadSellerOrder, markOrderPaid, addOrderNote,
  fulfillItem, cancelItem, setSelectedOrder,
  managedCatalog, catalogManageLoading,
  loadManagedCatalog, saveCatalogItemAction, deleteCatalogItemAction, toggleCatalogItemAction,
  groups, loadGroups,
  subscribers, loadSubscribers, manageSubscriber, summary,
} from '../store';
import type { PaymentSettings, CatalogItemInput, Billing, ProductOption } from '../api';
import { useI18n } from '@utsukta/spa-core/i18n';
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Select, Textarea } from "@ui/Field";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { Chip } from "@ui/Chip";
import { Stat } from "@ui/Stat";
import { Toggle } from "@ui/Toggle";
import { EmptyState } from "@ui/EmptyState";
import { SubscriptionRow, useBillingText, TERMS } from './Shop';

// ── My Shop (orders + catalog + settings toggle) ──────────────────────────────

export function MyShop() {
  const { t } = useI18n();
  const [showSettings, setShowSettings] = createSignal(false);
  const [showCatalog, setShowCatalog]   = createSignal(false);
  const [showSubs, setShowSubs]         = createSignal(false);

  const toggleSettings = () => {
    if (!showSettings() && !paymentSettings()) loadPaymentSettings();
    setShowSettings(s => !s);
    setShowCatalog(false);
    setShowSubs(false);
  };

  const toggleCatalog = () => {
    if (!showCatalog()) loadManagedCatalog();
    setShowCatalog(s => !s);
    setShowSettings(false);
    setShowSubs(false);
  };

  const toggleSubs = () => {
    if (!showSubs()) loadSubscribers();
    setShowSubs(s => !s);
    setShowSettings(false);
    setShowCatalog(false);
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-muted uppercase tracking-wide">
          {t('cart.orders_tab')}
        </span>
        <div class="flex gap-1">
          <IconButton
            label={t('cart.subscribers')}
            size="sm"
            pressed={showSubs()}
            onClick={toggleSubs}
          >
            <MdFillGroup size={16} />
          </IconButton>
          <IconButton
            label={t('cart.manage_catalog')}
            size="sm"
            pressed={showCatalog()}
            onClick={toggleCatalog}
          >
            <MdFillFormat_list_bulleted size={16} />
          </IconButton>
          <IconButton
            label={t('cart.payment_settings')}
            size="sm"
            pressed={showSettings()}
            onClick={toggleSettings}
          >
            <MdFillSettings size={16} />
          </IconButton>
        </div>
      </div>

      <Show when={showSettings()}>
        <PaymentSettingsPanel onClose={() => setShowSettings(false)} />
      </Show>
      <Show when={showCatalog()}>
        <CatalogManagerPanel />
      </Show>
      <Show when={showSubs()}>
        <Show when={subscribers().length > 0} fallback={<EmptyState size="sm">{t('cart.no_subscribers')}</EmptyState>}>
          <Card class="divide-y divide-rim overflow-hidden">
            <For each={subscribers()}>
              {(sub) => (
                <SubscriptionRow sub={sub} title={sub.buyer_name || sub.buyer || ''} subtitle={sub.desc}>
                  <Button size="sm" variant="ghost" disabled={!sub.billing}
                    onClick={() => manageSubscriber(sub.id, 'extend')}>
                    {t('cart.subs_extend')}
                  </Button>
                  <Show when={sub.active}>
                    <Button size="sm" variant="danger" onClick={() => manageSubscriber(sub.id, 'revoke')}>
                      {t('cart.revoke_access')}
                    </Button>
                  </Show>
                </SubscriptionRow>
              )}
            </For>
          </Card>
        </Show>
      </Show>
      <Show when={!showSettings() && !showCatalog() && !showSubs()}>
        <Show when={summary()}>
          {(sm) => (
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat accent label={t('cart.stat_revenue')}
                value={<For each={sm().revenue} fallback="—">{(r) => <span class="block">{r.amount} <span class="text-xs font-normal">{r.currency}</span></span>}</For>}
                hint={`${sm().orders} ${t('cart.stat_orders')}`} />
              <Stat label={t('cart.order_unpaid')} value={sm().unpaid} />
              <Stat label={t('cart.stat_to_fulfil')} value={sm().to_fulfil} />
              <Stat label={t('cart.subscribers')} value={sm().subscribers} />
            </div>
          )}
        </Show>
        <OrdersList />
      </Show>
    </div>
  );
}

// ── Catalog manager ───────────────────────────────────────────────────────────

function CatalogManagerPanel() {
  const { t } = useI18n();
  const billingText = useBillingText();
  const [editingSku, setEditingSku] = createSignal<string | null | undefined>(undefined);
  // undefined = form closed, null = new item, string = editing existing

  const openAdd  = () => setEditingSku(null);
  const openEdit = (sku: string) => setEditingSku(sku);
  const closeForm = () => setEditingSku(undefined);

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold text-muted uppercase tracking-wide">
          {t('cart.manage_catalog')}
        </span>
        <Button size="sm" onClick={openAdd}>
          <MdFillAdd size={14} /> {t('cart.catalog_add_item')}
        </Button>
      </div>

      <Show when={editingSku() !== undefined}>
        <CatalogItemForm sku={editingSku()!} onClose={closeForm} />
      </Show>

      <Show when={catalogManageLoading()}>
        <div class="space-y-2">
          <For each={Array(3).fill(0)}>
            {() => <div class="h-12 bg-elevated border border-rim rounded-xl animate-pulse" />}
          </For>
        </div>
      </Show>

      <Show when={!catalogManageLoading() && managedCatalog().length === 0}>
        <EmptyState size="sm">{t('cart.catalog_no_items')}</EmptyState>
      </Show>

      <Show when={!catalogManageLoading() && managedCatalog().length > 0}>
        <div class="bg-elevated border border-rim rounded-2xl divide-y divide-rim overflow-hidden">
          <For each={managedCatalog()}>
            {(item) => (
              <div class={`flex items-center gap-3 px-4 py-3 ${!item.active ? 'opacity-60' : ''}`}>
                <Show when={item.photo_url}
                  fallback={
                    <div class="w-10 h-10 bg-surface rounded-lg shrink-0 flex items-center justify-center">
                      <MdFillShopping_cart size={16} class="text-subtle" />
                    </div>
                  }
                >
                  <img src={item.photo_url!} alt={item.desc}
                  class="w-full h-auto block rounded-xl bg-surface" />
                </Show>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="text-sm font-medium text-txt truncate">{item.desc}</p>
                    <Show when={item.access}>
                      <Badge tone="accent" size="sm" class="shrink-0">
                        <MdFillKey size={10} /> {t('cart.access_badge')}
                      </Badge>
                    </Show>
                    <Show when={!item.active}>
                      <Badge size="sm" class="shrink-0">
                        {t('cart.catalog_inactive')}
                      </Badge>
                    </Show>
                  </div>
                  <p class="text-xs text-muted mt-0.5">{item.price}<Show when={paymentConfig()?.currency}> {paymentConfig()!.currency}</Show> {billingText(item.billing)}</p>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                  <IconButton
                    label={item.active ? t('cart.catalog_deactivate') : t('cart.catalog_activate')}
                    size="sm"
                    pressed={item.active}
                    onClick={() => toggleCatalogItemAction(item.sku)}
                  >
                    <Show when={item.active} fallback={<MdFillToggle_off size={20} />}>
                      <MdFillToggle_on size={20} />
                    </Show>
                  </IconButton>
                  <IconButton
                    label={t('cart.catalog_edit_item')}
                    size="sm"
                    onClick={() => openEdit(item.sku)}
                  >
                    <MdFillEdit size={16} />
                  </IconButton>
                  <IconButton
                    label={t('cart.catalog_delete')}
                    variant="danger"
                    size="sm"
                    onClick={() => deleteCatalogItemAction(item.sku)}
                  >
                    <MdFillDelete size={16} />
                  </IconButton>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function CatalogItemForm(props: { sku: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const billingText = useBillingText();
  const existing = () => managedCatalog().find(i => i.sku === props.sku);

  const [desc, setDesc]               = createSignal(existing()?.desc ?? '');
  const [price, setPrice]             = createSignal(existing()?.price_raw?.toString() ?? '0');
  const [photoUrl, setPhotoUrl]       = createSignal(existing()?.photo_url ?? '');
  const [active, setActive]           = createSignal(existing()?.active ?? true);
  const [grantGroups, setGrantGroups] = createSignal<string[]>(existing()?.grants?.groups ?? []);
  const [grantConnect, setGrantConnect] = createSignal(existing()?.grants?.connect ?? false);
  const [taxPct, setTaxPct]           = createSignal(existing()?.tax_percent?.toString() ?? '0');
  const [options, setOptions]         = createSignal<ProductOption[]>((existing()?.options ?? []).map(o => ({ ...o })));
  const patchOption = (i: number, patch: Partial<ProductOption>) =>
    setOptions(list => list.map((o, n) => n === i ? { ...o, ...patch } : o));
  const [recurring, setRecurring]     = createSignal(!!existing()?.billing);
  const [interval, setIntervalN]      = createSignal(existing()?.billing?.interval ?? 1);
  const [term, setTerm]               = createSignal<Billing['term']>(existing()?.billing?.term ?? 'month');
  const [saving, setSaving]           = createSignal(false);
  const [uploading, setUploading]     = createSignal(false);

  onMount(() => { if (groups().length === 0) loadGroups(); });
  const toggleGroup = (hash: string) =>
    setGrantGroups(g => g.includes(hash) ? g.filter(h => h !== hash) : [...g, hash]);
  const [uploadPct, setUploadPct]     = createSignal(0);

  // album picker state
  const [showPicker, setShowPicker]       = createSignal(false);
  const [albums, setAlbums]               = createSignal<Album[]>([]);
  const [albumsLoading, setAlbumsLoading] = createSignal(false);
  const [pickerAlbum, setPickerAlbum]     = createSignal<Album | null>(null);
  const [albumPhotos, setAlbumPhotos]     = createSignal<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = createSignal(false);

  let fileInput!: HTMLInputElement;

  const handleFileSelect = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    try {
      const result = await wallUpload(nick(), file, pct => setUploadPct(pct));
      setPhotoUrl(result.src);
    } catch {
      toast.error('Photo upload failed.');
    } finally {
      setUploading(false);
      setUploadPct(0);
      fileInput.value = '';
    }
  };

  const openPicker = async () => {
    setShowPicker(s => !s);
    setPickerAlbum(null);
    if (albums().length === 0) {
      setAlbumsLoading(true);
      try {
        setAlbums(await fetchAlbums(nick()));
      } catch {
        toast.error('Failed to load albums.');
      } finally {
        setAlbumsLoading(false);
      }
    }
  };

  const openAlbum = async (album: Album) => {
    setPickerAlbum(album);
    setPhotosLoading(true);
    try {
      const { photos } = await fetchPhotoAlbum(nick(), album.folder);
      setAlbumPhotos(photos);
    } catch {
      toast.error('Failed to load photos.');
    } finally {
      setPhotosLoading(false);
    }
  };

  const selectPhoto = (photo: Photo) => {
    setPhotoUrl(photo.src);
    setShowPicker(false);
    setPickerAlbum(null);
  };

  const save = async () => {
    if (!desc().trim()) return;
    setSaving(true);
    const item: CatalogItemInput = {
      description: desc().trim(),
      price: Math.max(0, parseFloat(price()) || 0),
      photo_url: photoUrl().trim() || undefined,
      active: active(),
      grants: { groups: grantGroups(), connect: grantConnect() },
      tax_percent: Math.min(99.99, Math.max(0, parseFloat(taxPct()) || 0)),
      options: options().filter(o => o.label.trim()),
      billing: recurring() ? { interval: Math.min(365, Math.max(1, interval())), term: term() } : null,
    };
    if (props.sku !== null) item.sku = props.sku;
    await saveCatalogItemAction(item);
    setSaving(false);
    props.onClose();
  };

  return (
    <div class="bg-elevated border border-accent/30 rounded-2xl p-4 flex flex-col gap-3">
      <p class="text-sm font-semibold text-txt">
        {props.sku !== null ? t('cart.catalog_edit_item') : t('cart.catalog_new_item')}
      </p>

      <Show when={props.sku !== null}>
        <p class="text-[0.6875rem] text-subtle font-mono">SKU: {props.sku}</p>
      </Show>

      <div class="flex flex-col gap-1">
        <Field label={t('cart.catalog_description')} size="sm">
          <Input
          type="text"
          value={desc()}
          onInput={e => setDesc(e.currentTarget.value)}
          placeholder="Item name / description"
          autofocus
          />
        </Field>
      </div>

      <div class="flex gap-4 flex-wrap">
        <Field label={t('cart.catalog_price')} size="sm">
          <Input
          class="w-32"
          type="number"
          value={price()}
          onInput={e => setPrice(e.currentTarget.value)}
          min="0"
          step="0.01"
          placeholder="0.00"
          />
        </Field>
        <Field label={t('cart.catalog_tax')} size="sm">
          <Input class="w-24" type="number" min="0" max="99.99" step="0.01"
            value={taxPct()} onInput={e => setTaxPct(e.currentTarget.value)} />
        </Field>
      </div>

      <div class="flex flex-col gap-1.5">
        <label class="text-xs text-muted">{t('cart.catalog_photo_url')}</label>

        {/* URL input + upload + albums picker toggle */}
        <div class="flex gap-2">
          <Input
            class="flex-1"
            type="url"
            value={photoUrl()}
            onInput={e => setPhotoUrl(e.currentTarget.value)}
            placeholder="https://…"
          />
          <Button
            variant="ghost"
            size="sm"
            class="shrink-0"
            onClick={() => fileInput.click()}
            disabled={uploading()}
            title="Upload from device"
          >
            <Show when={uploading()} fallback={<MdFillImage size={16} />}>
              <span class="text-[0.6875rem] font-mono w-7 text-center">{uploadPct()}%</span>
            </Show>
          </Button>
          <IconButton
            label="Choose from albums"
            variant="outline"
            pressed={showPicker()}
            onClick={openPicker}
          >
            <MdFillPhoto_library size={16} />
          </IconButton>
          <input ref={fileInput} type="file" accept="image/*" class="hidden" onChange={handleFileSelect} />
        </div>

        {/* Preview */}
        <Show when={photoUrl()}>
          <img
            src={photoUrl()}
            alt="preview"
            class="h-20 w-20 object-cover rounded-lg border border-rim"
            onError={e => (e.currentTarget.style.display = 'none')}
          />
        </Show>

        {/* Album picker panel */}
        <Show when={showPicker()}>
          <Card class="overflow-hidden">
            {/* Picker header */}
            <div class="flex items-center justify-between px-3 py-2 border-b border-rim bg-elevated">
              <Show when={pickerAlbum()} fallback={
                <span class="text-xs font-medium text-txt">Albums</span>
              }>
                <button
                  onClick={() => setPickerAlbum(null)}
                  class="flex items-center gap-1 text-xs text-accent hover:opacity-80"
                >
                  <MdFillArrow_back size={14} /> {pickerAlbum()!.album}
                </button>
              </Show>
              <button
                onClick={() => setShowPicker(false)}
                class="text-subtle hover:text-txt transition-colors text-xs leading-none px-1"
              >
                ✕
              </button>
            </div>

            {/* Picker body */}
            <div class="p-2 max-h-52 overflow-y-auto">

              {/* Loading skeleton */}
              <Show when={albumsLoading() || photosLoading()}>
                <div class="grid grid-cols-4 gap-1.5">
                  <For each={Array(8).fill(0)}>
                    {() => <div class="aspect-square bg-elevated rounded-lg animate-pulse" />}
                  </For>
                </div>
              </Show>

              {/* Album list */}
              <Show when={!pickerAlbum() && !albumsLoading()}>
                <Show when={albums().length === 0}>
                  <EmptyState size="sm">No albums found.</EmptyState>
                </Show>
                <div class="grid grid-cols-3 gap-1.5">
                  <For each={albums()}>
                    {(album) => (
                      <button
                        onClick={() => openAlbum(album)}
                        class="flex flex-col items-center gap-1 p-1.5 rounded-lg
                               hover:bg-elevated transition-colors text-left"
                      >
                        <div class="w-full aspect-square bg-elevated rounded-lg overflow-hidden shrink-0">
                          <Show when={album.thumb}
                            fallback={
                              <div class="w-full h-full flex items-center justify-center">
                                <MdFillPhoto_library size={20} class="text-subtle" />
                              </div>
                            }
                          >
                            <img src={album.thumb!} alt={album.album}
                              class="w-full h-full object-cover" />
                          </Show>
                        </div>
                        <span class="text-[0.625rem] text-muted truncate w-full text-center leading-tight">
                          {album.album}
                        </span>
                        <span class="text-[0.5625rem] text-subtle">{album.total}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              {/* Photo grid */}
              <Show when={pickerAlbum() && !photosLoading()}>
                <Show when={albumPhotos().length === 0}>
                  <EmptyState size="sm">No photos in this album.</EmptyState>
                </Show>
                <div class="grid grid-cols-4 gap-1.5">
                  <For each={albumPhotos()}>
                    {(photo) => (
                      <button
                        onClick={() => selectPhoto(photo)}
                        title={photo.title || photo.filename}
                        class="aspect-square rounded-lg overflow-hidden
                               hover:ring-2 hover:ring-accent transition-all"
                      >
                        <img src={variantSrc(photo.src, 3)} alt={photo.title || photo.filename}
                          class="w-full h-full object-cover" />
                      </button>
                    )}
                  </For>
                </div>
              </Show>

            </div>
          </Card>
        </Show>
      </div>

      <fieldset class="flex flex-col gap-2 border-t border-rim pt-3">
        <legend class="text-sm font-semibold text-txt">{t('cart.billing_title')}</legend>
        <Toggle label={t('cart.billing_recurring')} hint={recurring() ? undefined : t('cart.billing_once')}
          checked={recurring()} onChange={setRecurring} />
        <Show when={recurring()}>
          <div class="flex items-end gap-2 flex-wrap">
            <Field label={t('cart.billing_every')} size="sm">
              <Input class="w-20" type="number" min="1" max="365" step="1" value={interval()}
                onInput={e => setIntervalN(parseInt(e.currentTarget.value) || 1)} />
            </Field>
            <Select size="sm" class="w-auto" aria-label={t('cart.billing_title')} value={term()}
              onChange={e => setTerm(e.currentTarget.value as Billing['term'])}>
              <For each={TERMS}>
                {(tm) => <option value={tm}>{billingText({ interval: interval(), term: tm })}</option>}
              </For>
            </Select>
          </div>
        </Show>
      </fieldset>

      <fieldset class="flex flex-col gap-2 border-t border-rim pt-3">
        <legend class="text-sm font-semibold text-txt">{t('cart.options_title')}</legend>
        <p class="text-xs text-muted">{t('cart.options_hint')}</p>
        <For each={options()}>
          {(opt, i) => (
            <div class="flex items-center gap-2 flex-wrap">
              <Input class="flex-1 min-w-40" type="text" maxLength={100} aria-label={t('cart.option_label')}
                placeholder={t('cart.option_label')} value={opt.label}
                onChange={e => patchOption(i(), { label: e.currentTarget.value })} />
              <Chip size="sm" selected={opt.type === 'textarea'}
                onClick={() => patchOption(i(), { type: opt.type === 'textarea' ? 'text' : 'textarea' })}>
                {t('cart.option_long')}
              </Chip>
              <Chip size="sm" selected={opt.required} onClick={() => patchOption(i(), { required: !opt.required })}>
                {t('cart.option_required')}
              </Chip>
              <IconButton label={t('cart.remove')} size="sm" variant="danger"
                onClick={() => setOptions(list => list.filter((_, n) => n !== i()))}>
                <MdFillDelete size={16} />
              </IconButton>
            </div>
          )}
        </For>
        <Button variant="ghost" size="sm" class="self-start"
          onClick={() => setOptions(list => [...list, { label: '', type: 'text', required: false }])}>
          <MdFillAdd size={14} /> {t('cart.option_add')}
        </Button>
      </fieldset>

      <fieldset class="flex flex-col gap-2 border-t border-rim pt-3">
        <legend class="text-sm font-semibold text-txt">{t('cart.grants_title')}</legend>
        <p class="text-xs text-muted">{t('cart.grants_hint')}</p>
        <p class="text-xs text-muted mt-1">{t('cart.grants_groups')}</p>
        <Show when={groups().length > 0}
          fallback={<p class="text-xs text-subtle italic">{t('cart.grants_no_groups')}</p>}
        >
          <div class="flex flex-wrap gap-1.5">
            <For each={groups()}>
              {(g) => (
                <Chip selected={grantGroups().includes(g.hash)} onClick={() => toggleGroup(g.hash)}>
                  {g.name}
                </Chip>
              )}
            </For>
          </div>
        </Show>
        <Toggle label={t('cart.grants_connect')} checked={grantConnect()} onChange={setGrantConnect} />
      </fieldset>

      <label class="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={active()}
          onChange={e => setActive(e.currentTarget.checked)}
          class="rounded"
        />
        <span class="text-sm text-txt">{t('cart.catalog_active')}</span>
      </label>

      <div class="flex gap-2 pt-1">
        <Button onClick={save} disabled={saving() || !desc().trim()}>
          {saving() ? '…' : t('cart.catalog_save_item')}
        </Button>
        <Button variant="ghost" onClick={props.onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Payment settings panel ────────────────────────────────────────────────────

function PaymentSettingsPanel(props: { onClose: () => void }) {
  const { t } = useI18n();
  const defaults = (): PaymentSettings => ({
    currency:  paymentConfig()?.currency ?? 'USD',
    paypal:    { enabled: false, client_id: '', secret: '', mode: 'sandbox' },
    razorpay:  { enabled: false, key_id: '', key_secret: '', currency: 'INR' },
    cashfree:  { enabled: false, app_id: '', secret_key: '', mode: 'sandbox' },
    upi:       { enabled: false, upi_id: '', display_name: '' },
    manual:    { enabled: true, instructions: '' },
  });

  const [form, setForm] = createSignal<PaymentSettings>(paymentSettings() ?? defaults());

  createEffect(() => {
    const s = paymentSettings();
    if (s) setForm(s);
  });

  const set = (path: string[], value: unknown) =>
    setForm(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as PaymentSettings;
      let cur: any = next;
      for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
      cur[path[path.length - 1]] = value;
      return next;
    });

  const save = async () => {
    await savePaymentSettings(form());
    props.onClose();
  };

  return (
    <div class="bg-elevated border border-rim rounded-2xl p-4 flex flex-col gap-5">
      <p class="text-sm font-semibold text-txt">{t('cart.payment_settings')}</p>

      {/* Store currency */}
      <div class="flex flex-col gap-1.5 pb-2 border-b border-rim">
        <label class="text-xs font-medium text-muted">{t('cart.store_currency')}</label>
        <div class="flex items-center gap-2">
          <Input
            class="font-mono w-20 uppercase tracking-widest"
            type="text"
            value={form().currency}
            onInput={e => set(['currency'], e.currentTarget.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
            maxlength="3"
            placeholder="USD"
          />
          <span class="text-xs text-subtle">{t('cart.store_currency_hint')}</span>
        </div>
      </div>

      {/* PayPal */}
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="pp-enabled"
            checked={form().paypal.enabled}
            onChange={e => set(['paypal', 'enabled'], e.currentTarget.checked)}
            class="rounded"
          />
          <label for="pp-enabled" class="text-sm font-medium text-txt">PayPal</label>
        </div>

        <Show when={form().paypal.enabled}>
          <div class="flex flex-col gap-2 pl-6">
            <div class="flex flex-col gap-1">
              <Field label={t('cart.paypal_client_id')} size="sm">
                <Input
                class="font-mono"
                type="text"
                value={form().paypal.client_id}
                onInput={e => set(['paypal', 'client_id'], e.currentTarget.value)}
                placeholder="A..."
                />
              </Field>
            </div>
            <div class="flex flex-col gap-1">
              <Field label={t('cart.paypal_secret')} size="sm">
                <Input
                class="font-mono"
                type="password"
                value={form().paypal.secret}
                onInput={e => set(['paypal', 'secret'], e.currentTarget.value)}
                placeholder="E..."
                />
              </Field>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-muted">{t('cart.paypal_mode')}</label>
              <div class="flex gap-2">
                <label class="flex items-center gap-1.5 text-sm text-txt cursor-pointer">
                  <input type="radio" name="pp-mode"
                    checked={form().paypal.mode === 'sandbox'}
                    onChange={() => set(['paypal', 'mode'], 'sandbox')} />
                  {t('cart.paypal_sandbox')}
                </label>
                <label class="flex items-center gap-1.5 text-sm text-txt cursor-pointer">
                  <input type="radio" name="pp-mode"
                    checked={form().paypal.mode === 'live'}
                    onChange={() => set(['paypal', 'mode'], 'live')} />
                  {t('cart.paypal_live')}
                </label>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* Razorpay */}
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="rp-enabled"
            checked={form().razorpay.enabled}
            onChange={e => set(['razorpay', 'enabled'], e.currentTarget.checked)}
            class="rounded"
          />
          <label for="rp-enabled" class="text-sm font-medium text-txt">Razorpay</label>
        </div>
        <Show when={form().razorpay.enabled}>
          <div class="flex flex-col gap-2 pl-6">
            <div class="flex flex-col gap-1">
              <Field label={t('cart.razorpay_key_id')} size="sm">
                <Input
                class="font-mono"
                type="text"
                value={form().razorpay.key_id}
                onInput={e => set(['razorpay', 'key_id'], e.currentTarget.value)}
                placeholder="rzp_test_..."
                />
              </Field>
            </div>
            <div class="flex flex-col gap-1">
              <Field label={t('cart.razorpay_key_secret')} size="sm">
                <Input
                class="font-mono"
                type="password"
                value={form().razorpay.key_secret}
                onInput={e => set(['razorpay', 'key_secret'], e.currentTarget.value)}
                />
              </Field>
            </div>
            <div class="flex flex-col gap-1">
              <Field label={t('cart.razorpay_currency')} size="sm">
                <Input
                class="font-mono w-24"
                type="text"
                value={form().razorpay.currency}
                onInput={e => set(['razorpay', 'currency'], e.currentTarget.value.toUpperCase())}
                maxlength="3"
                />
              </Field>
            </div>
          </div>
        </Show>
      </div>

      {/* Cashfree */}
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="cf-enabled"
            checked={form().cashfree.enabled}
            onChange={e => set(['cashfree', 'enabled'], e.currentTarget.checked)}
            class="rounded"
          />
          <label for="cf-enabled" class="text-sm font-medium text-txt">Cashfree</label>
        </div>
        <Show when={form().cashfree.enabled}>
          <div class="flex flex-col gap-2 pl-6">
            <div class="flex flex-col gap-1">
              <Field label={t('cart.cashfree_app_id')} size="sm">
                <Input
                class="font-mono"
                type="text"
                value={form().cashfree.app_id}
                onInput={e => set(['cashfree', 'app_id'], e.currentTarget.value)}
                placeholder="TEST..."
                />
              </Field>
            </div>
            <div class="flex flex-col gap-1">
              <Field label={t('cart.cashfree_secret_key')} size="sm">
                <Input
                class="font-mono"
                type="password"
                value={form().cashfree.secret_key}
                onInput={e => set(['cashfree', 'secret_key'], e.currentTarget.value)}
                />
              </Field>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs text-muted">{t('cart.cashfree_mode')}</label>
              <div class="flex gap-2">
                <label class="flex items-center gap-1.5 text-sm text-txt cursor-pointer">
                  <input type="radio" name="cf-mode"
                    checked={form().cashfree.mode === 'sandbox'}
                    onChange={() => set(['cashfree', 'mode'], 'sandbox')} />
                  {t('cart.cashfree_sandbox')}
                </label>
                <label class="flex items-center gap-1.5 text-sm text-txt cursor-pointer">
                  <input type="radio" name="cf-mode"
                    checked={form().cashfree.mode === 'production'}
                    onChange={() => set(['cashfree', 'mode'], 'production')} />
                  {t('cart.cashfree_production')}
                </label>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* UPI */}
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="upi-enabled"
            checked={form().upi.enabled}
            onChange={e => set(['upi', 'enabled'], e.currentTarget.checked)}
            class="rounded"
          />
          <label for="upi-enabled" class="text-sm font-medium text-txt">UPI</label>
        </div>
        <Show when={form().upi.enabled}>
          <div class="flex flex-col gap-2 pl-6">
            <div class="flex flex-col gap-1">
              <Field label={t('cart.upi_id_label')} size="sm">
                <Input
                class="font-mono"
                type="text"
                value={form().upi.upi_id}
                onInput={e => set(['upi', 'upi_id'], e.currentTarget.value)}
                placeholder="yourname@upi"
                />
              </Field>
            </div>
            <div class="flex flex-col gap-1">
              <Field label={t('cart.upi_display_name')} size="sm">
                <Input
                type="text"
                value={form().upi.display_name}
                onInput={e => set(['upi', 'display_name'], e.currentTarget.value)}
                placeholder="Your Shop Name"
                />
              </Field>
            </div>
          </div>
        </Show>
      </div>

      {/* Manual */}
      <div class="flex flex-col gap-2">
        <p class="text-xs font-medium text-muted">{t('cart.manual_instructions')}</p>
        <Textarea
          class="resize-none"
          value={form().manual.instructions}
          onInput={e => set(['manual', 'instructions'], e.currentTarget.value)}
          rows={3}
          placeholder="e.g. Bank transfer to account #1234…"
        />
      </div>

      <div class="flex gap-2">
        <Button onClick={save} disabled={paymentSettingsLoading()}>
          {paymentSettingsLoading() ? t('cart.payment_processing') : t('cart.save_settings')}
        </Button>
        <Button variant="ghost" onClick={props.onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Seller: orders list ───────────────────────────────────────────────────────

function OrdersList() {
  const { t } = useI18n();
  return (
    <div class="flex flex-col gap-4">
      <Show when={ordersLoading()}>
        <div class="space-y-3">
          <For each={Array(4).fill(0)}>
            {() => <div class="h-14 bg-elevated border border-rim rounded-2xl animate-pulse" />}
          </For>
        </div>
      </Show>

      <Show when={!ordersLoading() && sellerOrders().length === 0}>
        <div class="text-center py-14">
          <MdFillReceipt_long size={48} class="text-subtle mx-auto mb-3" />
          <p class="text-muted text-sm">{t('cart.no_orders')}</p>
        </div>
      </Show>

      <Show when={!ordersLoading() && sellerOrders().length > 0}>
        <div class="bg-elevated border border-rim rounded-2xl divide-y divide-rim overflow-hidden">
          <For each={sellerOrders()}>
            {(ord) => (
              <button
                onClick={() => loadSellerOrder(ord.hash!)}
                class="w-full flex items-center gap-3 p-4 hover:bg-surface text-left transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-txt truncate">
                    {ord.buyer_name || ord.buyer}
                  </p>
                  <p class="text-xs text-muted mt-0.5 truncate">
                    {ord.hash?.slice(0, 12)}… · {ord.total} {ord.currency}
                    <Show when={ord.payment}>
                      {' · '}<span class="text-accent">{ord.payment!.provider}</span>
                    </Show>
                  </p>
                </div>
                <StatusBadge paid={ord.paid} fulfilled={ord.flags?.fulfilled} exception={ord.flags?.exception} />
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}


// ── Seller: order detail ──────────────────────────────────────────────────────

export function OrderDetail() {
  const { t } = useI18n();
  const ord = selectedOrder;
  const [noteText, setNoteText] = createSignal('');

  const submitNote = async () => {
    const text = noteText().trim();
    if (!text || !ord()?.hash) return;
    await addOrderNote(ord()!.hash!, text);
    setNoteText('');
  };

  return (
    <Show when={ord()}>
      <div class="flex flex-col gap-4">
        <button
          onClick={() => setSelectedOrder(null)}
          class="text-sm text-accent hover:underline self-start"
        >
          {t('cart.back_to_orders')}
        </button>

        <Show when={orderDetailLoading()}>
          <div class="h-40 bg-elevated border border-rim rounded-2xl animate-pulse" />
        </Show>

        <Show when={!orderDetailLoading()}>
          <div class="bg-elevated border border-rim rounded-2xl p-4 flex flex-col gap-2">
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-sm font-semibold text-txt">{ord()!.buyer_name || ord()!.buyer}</p>
                <p class="text-xs text-muted mt-0.5">#{ord()!.hash?.slice(0, 16)}</p>
                <Show when={ord()!.payment}>
                  <p class="text-xs text-accent mt-0.5">
                    {t('cart.paid_via')} {ord()!.payment!.provider}
                    {ord()!.payment!.txn_id ? ` · ${ord()!.payment!.txn_id.slice(0, 12)}…` : ''}
                  </p>
                </Show>
              </div>
              <StatusBadge paid={ord()!.paid} fulfilled={ord()!.flags?.fulfilled} exception={ord()!.flags?.exception} />
            </div>
            <div class="flex items-center justify-between text-sm pt-1">
              <span class="text-muted">{t('cart.order_total')}</span>
              <span class="font-semibold text-txt">{ord()!.total} <span class="text-xs font-normal text-muted">{ord()!.currency}</span></span>
            </div>
            <Show when={ord()!.tax_raw > 0}>
              <p class="text-xs text-muted text-right">{t('cart.subtotal')} {ord()!.subtotal} + {t('cart.tax')} {ord()!.tax}</p>
            </Show>
            <Show when={!ord()!.paid}>
              <Button class="mt-1 w-full" onClick={() => markOrderPaid(ord()!.hash!)}>
                {t('cart.mark_paid')}
              </Button>
            </Show>
          </div>

          <div class="bg-elevated border border-rim rounded-2xl overflow-hidden">
            <p class="text-xs font-semibold text-muted uppercase tracking-wide px-4 pt-3 pb-2">
              {t('cart.order_items')}
            </p>
            <div class="divide-y divide-rim">
              <For each={ord()!.items}>
                {(item) => (
                  <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-txt truncate">
                        <Show when={item.access}><MdFillKey size={12} class="inline text-accent mr-1" /></Show>
                        {item.desc}
                      </p>
                      <p class="text-xs text-muted mt-0.5">{item.price} {ord()!.currency} × {item.qty}</p>
                      <For each={item.options ?? []}>
                        {(o) => <p class="text-xs text-txt mt-0.5 break-words"><span class="text-muted">{o.label}:</span> {o.value}</p>}
                      </For>
                      {/* Why it failed — the last note is the grant error. */}
                      <Show when={item.exception && item.notes?.length}>
                        <p class="text-xs text-danger-txt mt-0.5">{item.notes![item.notes!.length - 1]}</p>
                      </Show>
                    </div>
                    <ItemStatusBadge item={item} />
                    <div class="flex gap-1 shrink-0">
                      <Show when={item.fulfilled}>
                        <button
                          onClick={() => cancelItem(ord()!.hash!, item.id)}
                          class="px-2 py-1 rounded-lg text-xs font-medium bg-danger-muted
                                 text-danger-txt hover:opacity-80 transition-opacity"
                        >
                          {item.access ? t('cart.revoke_access') : t('cart.cancel_item')}
                        </button>
                      </Show>
                      <Show when={!item.fulfilled}>
                        <button
                          onClick={() => fulfillItem(ord()!.hash!, item.id)}
                          class="px-2 py-1 rounded-lg text-xs font-medium bg-success-muted
                                 text-success-txt hover:opacity-80 transition-opacity"
                        >
                          {t('cart.fulfill_item')}
                        </button>
                        <button
                          onClick={() => cancelItem(ord()!.hash!, item.id)}
                          class="px-2 py-1 rounded-lg text-xs font-medium bg-danger-muted
                                 text-danger-txt hover:opacity-80 transition-opacity"
                        >
                          {t('cart.cancel_item')}
                        </button>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="bg-elevated border border-rim rounded-2xl p-4 flex flex-col gap-3">
            <p class="text-xs font-semibold text-muted uppercase tracking-wide">
              {t('cart.order_notes')}
            </p>
            <Show when={(ord()!.notes ?? []).length === 0}>
              <p class="text-xs text-subtle italic">—</p>
            </Show>
            <For each={ord()!.notes ?? []}>
              {(note) => (
                <p class="text-xs text-muted border-l-2 border-accent pl-2">{note}</p>
              )}
            </For>
            <div class="flex gap-2 mt-1">
              <Input
                class="flex-1"
                type="text"
                value={noteText()}
                onInput={e => setNoteText(e.currentTarget.value)}
                onKeyDown={e => e.key === 'Enter' && submitNote()}
                placeholder={t('cart.note_placeholder')}
              />
              <Button size="sm" onClick={submitNote} disabled={!noteText().trim()}>
                {t('cart.add_note')}
              </Button>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}

// ── Status badges ─────────────────────────────────────────────────────────────

function StatusBadge(props: { paid?: boolean; fulfilled?: boolean; exception?: boolean }) {
  const { t } = useI18n();
  return (
    <div class="flex flex-wrap gap-1 justify-end shrink-0">
      <Show when={props.exception}>
        <Badge tone="danger" size="sm">
          <MdFillError size={10} /> {t('cart.order_exception')}
        </Badge>
      </Show>
      <span class={`text-[0.625rem] font-medium px-1.5 py-0.5 rounded-full ${props.paid
        ? 'bg-success-muted text-success-txt'
        : 'bg-warning-muted text-warning-txt'}`}>
        {props.paid ? t('cart.order_paid') : t('cart.order_unpaid')}
      </span>
      <span class={`text-[0.625rem] font-medium px-1.5 py-0.5 rounded-full ${props.fulfilled
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
        : 'bg-surface text-muted'}`}>
        {props.fulfilled ? t('cart.order_fulfilled') : t('cart.order_pending')}
      </span>
    </div>
  );
}

function ItemStatusBadge(props: { item: import('../api').OrderItem }) {
  const { t } = useI18n();
  const item = () => props.item;
  return (
    <Show when={item().fulfilled !== undefined}>
      <span class={`text-[0.625rem] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
        item().exception
          ? 'bg-danger-muted text-danger-txt'
          : item().fulfilled
            ? 'bg-success-muted text-success-txt'
            : 'bg-surface text-muted'
      }`}>
        {item().exception ? t('cart.item_exception') : item().fulfilled ? t('cart.item_fulfilled') : t('cart.item_pending')}
      </span>
    </Show>
  );
}

