import { createSignal, Show, For, type Component } from "solid-js";
import { Portal } from "solid-js/web";
import { MdFillLock, MdOutlineContent_copy } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { fetchLockview, scopeLabel, type Lockview, type LockviewType } from "@utsukta/spa-core/lib/lockview-api";

/**
 * The padlock on a private item — classic's lockview dropdown (conv_item.tpl:83
 * → Zotlabs/Module/Lockview.php), showing who the item is visible to plus any
 * guest-access links.
 *
 * Fetched on first open rather than with the post: a stream renders dozens of
 * items and almost none of these ever get clicked.
 */
const LockviewPopover: Component<{
  type: LockviewType;
  id: number | string;
  size?: number;
}> = (props) => {
  const { t } = useI18n();
  const { open, setOpen, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "bottom-start", offset: 4 });

  const [data, setData] = createSignal<Lockview | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  function onToggle(e: MouseEvent) {
    e.stopPropagation();
    toggle();
    if (!data() && !loading()) {
      setLoading(true);
      fetchLockview(props.type, props.id)
        .then((d) => { setData(d); setFailed(!d); })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    }
  }

  function copy(value: string) {
    navigator.clipboard.writeText(value)
      .then(() => toast.success(t("share.copied") as string))
      .catch(() => toast.error(t("share.copy_failed") as string));
  }

  const size = () => props.size ?? 10;

  return (
    <>
      <button
        ref={setTriggerRef}
        onClick={onToggle}
        title={t("share.who_can_see") as string}
        aria-label={t("share.who_can_see") as string}
        class={`flex items-center rounded transition-colors hover:bg-overlay
               ${open() ? "text-accent" : "text-muted hover:text-txt"}`}
      >
        <MdFillLock size={size()} />
      </button>

      <Portal>
        <Show when={open()}>
          <div
            ref={setPanelRef}
            style={floatStyle()}
            onClick={(e) => e.stopPropagation()}
            class="z-[9999] min-w-[13rem] max-w-[20rem] bg-surface border border-rim
                   rounded-lg shadow-lg py-1 text-xs"
          >
            <Show when={!loading()} fallback={<div class="px-3 py-2 text-muted">…</div>}>
              {/* The endpoint refuses items we don't own rather than leaking
                  another channel's audience, so a failure here is expected
                  on someone else's private post. */}
              <Show when={data() && !failed()} fallback={
                <div class="px-3 py-2 text-muted">{t("share.audience_unknown")}</div>
              }>
                <div class="px-3 py-1.5 font-semibold text-txt">{t("share.who_can_see")}</div>

                {/* Private with no audience to enumerate (feed items,
                    private-to-self, bcc): show the scope instead. */}
                <Show when={data()!.no_audience}>
                  <div class="px-3 py-1.5 text-muted">
                    {scopeLabel(data()!.scope, t as never)}
                  </div>
                </Show>

                <For each={data()!.access}>
                  {(entry) => (
                    <div class={`px-3 py-1.5 text-txt ${entry.denied ? "line-through text-muted" : ""}`}>
                      {entry.name}
                    </div>
                  )}
                </For>

                <Show when={data()!.guests.length > 0}>
                  <div class="mt-1 pt-1 border-t border-rim">
                    <div class="px-3 py-1.5 font-semibold text-txt">
                      {t("share.guest_access_title")}
                    </div>
                    <For each={data()!.guests}>
                      {(g) => (
                        <button
                          type="button"
                          onClick={() => { copy(g.url); setOpen(false); }}
                          class="w-full flex items-center justify-between gap-2 px-3 py-1.5
                                 text-txt hover:bg-overlay transition-colors text-left"
                        >
                          <span class="truncate">{g.name}</span>
                          <MdOutlineContent_copy size={12} class="shrink-0 text-muted" />
                        </button>
                      )}
                    </For>
                    <p class="px-3 py-1.5 text-[0.625rem] text-amber-600 dark:text-amber-500">
                      {t("share.guest_access_warning")}
                    </p>
                  </div>
                </Show>
              </Show>
            </Show>
          </div>
        </Show>
      </Portal>
    </>
  );
};

export default LockviewPopover;
