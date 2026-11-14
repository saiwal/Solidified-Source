import { createEffect, Show, For } from 'solid-js';
import { usePageNick } from '@utsukta/spa-core/store/site-config';
import { tab, switchTab, loading, loadCatalog, selectedOrder } from '../store';
import { CatalogGrid, CartContents, MyOrders } from '../views/Shop';
import { MyShop, OrderDetail } from '../views/Seller';

export default function CartContentWidget() {
  const pageNick = usePageNick();

  createEffect(() => {
    const n = pageNick() ?? '';
    if (n) loadCatalog(n);
  });

  return (
    <div class="max-w-3xl mx-auto">
      <Show when={loading()}>
        <CatalogSkeleton />
      </Show>
      <Show when={!loading() && tab() === 'catalog'}>
        <CatalogGrid />
      </Show>
      <Show when={!loading() && tab() === 'cart'}>
        <CartContents onBrowse={() => switchTab('catalog')} />
      </Show>
      <Show when={tab() === 'purchases'}>
        <MyOrders />
      </Show>
      <Show when={tab() === 'orders'}>
        <Show when={selectedOrder() !== null}>
          <OrderDetail />
        </Show>
        <Show when={selectedOrder() === null}>
          <MyShop />
        </Show>
      </Show>
    </div>
  );
}


// ── Skeleton ──────────────────────────────────────────────────────────────────

const SKELETON_HEIGHTS = ['h-28', 'h-40', 'h-24', 'h-48', 'h-32', 'h-36'];

function CatalogSkeleton() {
  return (
    <div class="columns-1 sm:columns-2 lg:columns-3 gap-4">
      <For each={SKELETON_HEIGHTS}>
        {(h) => (
          <div class="break-inside-avoid mb-4 bg-elevated border border-rim rounded-2xl p-4 animate-pulse">
            <div class={`w-full ${h} bg-surface rounded-xl mb-3`} />
            <div class="h-4 bg-surface rounded w-3/4 mb-2" />
            <div class="h-4 bg-surface rounded w-1/3 mb-3" />
            <div class="h-9 bg-surface rounded-xl" />
          </div>
        )}
      </For>
    </div>
  );
}
