import { useI18n } from "@utsukta/spa-core/i18n";
import { createSignal, Show, type Component } from "solid-js";
import { MdOutlineEdit, MdOutlineMail, MdOutlineRefresh } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import PostComposer from "@/shared/editor/composers/PostComposer";
import DMComposer from "@/shared/editor/composers/DMComposer";
import { FEED_META, MessageList, type MessageType } from "./MessageList";

// Card chrome (title + refresh/compose actions + author-filter search)
// around the shared MessageList. Each concrete hq.messages.* widget is a
// thin wrapper that fixes `type`; see HqDirectMessagesWidget.tsx and
// HqNoticesWidget.tsx. `bare` drops the outer card + title so this can be
// embedded as the "All" tab inside HqMessagesWidget, which owns its own
// card chrome and tab bar instead.
export const MessageFeed: Component<{ type: MessageType; bare?: boolean }> = (props) => {
  const { t } = useI18n();
  const auth = useAuth();
  const [authorFilter, setAuthorFilter] = createSignal("");
  const [showCompose, setShowCompose] = createSignal(false);
  const [reloadKey, setReloadKey] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);

  let filterTimer: ReturnType<typeof setTimeout>;
  function onFilterInput(val: string) {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => setAuthorFilter(val), 300);
  }

  // Compose FAB only makes sense on the "all" and "direct" feeds — starred
  // and notification entries aren't things a user composes.
  const canCompose = () => props.type === "" || props.type === "direct";

  const body = (
    <>
      {/* ── Header ── */}
      <div class="px-3.5 pt-3.5 pb-2 shrink-0">
        <div class="flex items-center justify-between">
          <Show when={!props.bare} fallback={<span />}>
            <span class="text-xs font-medium uppercase tracking-wider text-muted">
              {t(FEED_META[props.type].titleKey as "hq.msg_tab_all")}
            </span>
          </Show>
          <div class="flex items-center gap-1">
            <Show when={canCompose() && !auth.loading && auth()?.uid}>
              <button
                type="button"
                title={props.type === "direct" ? t("hq.new_dm") : t("hq.new_post")}
                onClick={() => setShowCompose(true)}
                class="w-6 h-6 flex items-center justify-center rounded-md text-muted
                       hover:bg-overlay hover:text-txt transition-colors"
              >
                <Show when={props.type === "direct"} fallback={<MdOutlineEdit size={14} />}>
                  <MdOutlineMail size={14} />
                </Show>
              </button>
            </Show>

            <button
              type="button"
              title={t("hq.refresh")}
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={refreshing()}
              class="w-6 h-6 flex items-center justify-center rounded-md text-muted
                     hover:bg-overlay hover:text-txt transition-colors disabled:opacity-50"
            >
              <MdOutlineRefresh size={14} class={refreshing() ? "animate-spin" : ""} />
            </button>

            <div class="relative">
              <svg
                class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder={t("hq.filter_placeholder")}
                class="w-32 text-xs bg-overlay border-0 rounded-lg
                       pl-7 pr-3 py-1 text-txt placeholder-muted
                       focus:outline-none focus:ring-2 focus:ring-accent/40
                       transition-all duration-200 focus:w-40"
                onInput={(e) => onFilterInput(e.currentTarget.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <MessageList
        type={props.type}
        authorFilter={authorFilter()}
        reloadKey={reloadKey()}
        onRefreshingChange={setRefreshing}
      />

      <Show when={showCompose() && props.type === "" && !auth.loading && auth()?.uid}>
        <PostComposer
          profileUid={auth()!.uid}
          open={true}
          onPosted={() => setShowCompose(false)}
          onClose={() => setShowCompose(false)}
        />
      </Show>

      <Show when={showCompose() && props.type === "direct" && !auth.loading && auth()?.uid}>
        <DMComposer
          profileUid={auth()!.uid}
          open={true}
          onSent={() => setShowCompose(false)}
          onClose={() => setShowCompose(false)}
        />
      </Show>
    </>
  );

  return (
    <Show
      when={!props.bare}
      fallback={<div class="flex-1 flex flex-col overflow-hidden">{body}</div>}
    >
      <div
        data-tour={`hq.messages.${props.type}`}
        class="bg-surface rounded-2xl border border-rim flex flex-col overflow-hidden shadow-sm"
        style={{ "max-height": "480px" }}
      >
        {body}
      </div>
    </Show>
  );
};
