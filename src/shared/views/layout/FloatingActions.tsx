import { createEffect, createSignal, For, lazy, on, onCleanup, onMount, Show, Suspense, type JSX } from "solid-js";
import { useLocation } from "@solidjs/router";
import { MdFillEdit, MdFillMore_vert, MdOutlineClose, MdOutlineExpand_less, MdOutlineSearch } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { ViewerRole } from "@utsukta/spa-core/store/site-config";
import { IconButton } from "@ui/Button";
import { moduleCategory } from "./app-categories";
import {
  floatingAction, mobilePrimary, pageMenuGroups, pageSearch,
  useMobileActions, type PageAction, type PageSearch,
} from "./PageActions";
import { hasMinimized } from "@/shared/views/modal-host";

// Loaded only when Compose is picked, so the create actions (and what they
// import) stay out of the shell bundle.
const ComposeDialItems = lazy(() => import("./ComposeDialItems"));

const ROUND =
  "w-10 h-10 rounded-full flex items-center justify-center bg-elevated border border-rim " +
  "shadow hover:shadow-md transition-all disabled:opacity-60";

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || el.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select"));

/**
 * The floating column bottom-right. One flex column, so the buttons stack
 * without per-button offsets.
 *
 * Mobile: a "more" button, plus scroll-to-top once scrolled. "More" fans out a column
 * of labelled buttons: the page's innermost `primary` PageAction (falling back
 * to Compose for the owner in social apps, which swaps the column for the
 * create actions), search, then every other page
 * action. While a text field
 * has focus (the keyboard is up) the column hides.
 *
 * Desktop keeps actions and search inline; only a form's Save
 * (`useFloatingAction`) floats, above scroll-to-top.
 */
export default function FloatingActions(props: {
  showScrollTop: boolean;
  onScrollTop: () => void;
  hidesRightSidebar: boolean;
  viewerRole: ViewerRole;
  activeModuleId: string;
}) {
  const { t } = useI18n();
  const mobile = useMobileActions();
  const location = useLocation();

  const [composing, setComposing] = createSignal(false);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [dialOpen, setDialOpen] = createSignal(false);
  const [typing, setTyping] = createSignal(false);
  const close = () => { setDialOpen(false); setComposing(false); };
  // A navigation hands the page (and its search) over to the next one.
  createEffect(on(() => location.pathname, () => { setSearchOpen(false); close(); }, { defer: true }));

  onMount(() => {
    const onIn = (e: FocusEvent) => setTyping(isEditable(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    onCleanup(() => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    });
  });

  // Compose is self-targeted, so it is for the owner, and only in the social
  // apps where posting is what the page is about.
  const compose = (): PageAction | undefined =>
    props.viewerRole === "owner" && moduleCategory(props.activeModuleId) === "social"
      ? { label: t("layout.compose"), icon: MdFillEdit, onClick: () => { setComposing(true); setDialOpen(true); } }
      : undefined;

  // Mobile only: everything "more" fans out. `primary` marks the accented
  // ones — the main action, and search while a query is active.
  const items = (): PageAction[] => {
    if (!mobile()) return [];
    const s = pageSearch();
    return [
      ...[mobilePrimary() ?? compose()].filter((a): a is PageAction => !!a).map((a) => ({ ...a, primary: true })),
      ...(s ? [{ label: s.placeholder ?? t("layout.search"), icon: MdOutlineSearch, primary: !!s.value, onClick: () => setSearchOpen(true) }] : []),
      ...pageMenuGroups().flatMap((g) => g.actions),
    ];
  };
  const hidden = () => mobile() && typing() && !searchOpen();

  return (
    <>
      <Show when={dialOpen()}>
        <div class="fixed inset-0 z-50 bg-black/30" aria-hidden="true" onClick={close} />
      </Show>

      <div
        class={`fixed z-50 right-4 lg:right-6 bottom-[4.5rem] lg:bottom-20 xl:bottom-8
               ${props.hidesRightSidebar ? "xl:right-6" : "xl:right-[19.5rem]"}
               flex flex-col-reverse items-end gap-2`}
        // Lift the stack above the minimized-composer pills (ModalHost).
        classList={{ invisible: hidden(), "mb-11": hasMinimized() }}
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <Show when={mobile()} fallback={<Show when={floatingAction()}>{(a) => <MainButton action={a()} />}</Show>}>
          <Show when={items().length}>
            <button
              type="button"
              class={ROUND}
              aria-label={t("layout.more")}
              aria-expanded={dialOpen()}
              aria-controls="floating-more"
              onClick={() => setDialOpen((o) => !o)}
            >
              <Show when={dialOpen()} fallback={<MdFillMore_vert size={18} />}>
                <MdOutlineClose size={18} />
              </Show>
            </button>
          </Show>
        </Show>

        <Show when={dialOpen()}>
          {/* flex-col-reverse: the first item sits nearest the toggle. */}
          <ul id="floating-more" class="flex flex-col-reverse items-end gap-2 max-h-[60vh] overflow-y-auto p-1 -m-1">
            {/* Compose swaps the column for the create actions. */}
            <Show
              when={composing()}
              fallback={
                <For each={items()}>
                  {(a) => (
                    <li>
                      <DialItem action={a} onPick={close} />
                    </li>
                  )}
                </For>
              }
            >
              <Suspense>
                <ComposeDialItems onPick={close} />
              </Suspense>
            </Show>
          </ul>
        </Show>

        <Show when={!dialOpen() && props.showScrollTop}>
          <button
            type="button"
            class={ROUND}
            aria-label={t("layout.scroll_top")}
            onClick={props.onScrollTop}
          >
            <MdOutlineExpand_less class="w-4 h-4" />
          </button>
        </Show>
      </div>

      <Show when={searchOpen() && pageSearch()}>
        {(s) => <SearchBar search={s()} onClose={() => setSearchOpen(false)} />}
      </Show>

    </>
  );
}

const actionIcon = (a: PageAction): JSX.Element =>
  a.icon?.({ size: 18 }) ?? <span class="text-xs font-semibold">{a.label.slice(0, 1)}</span>;

/** One row of the fanned-out column: a label pill beside a round icon, the
 * whole row one tap target. */
export function DialItem(props: { action: PageAction; onPick: () => void }) {
  const a = () => props.action;
  const cls = "flex items-center gap-2 disabled:opacity-60";
  const body = () => (
    <>
      <span class="max-w-[60vw] truncate px-2.5 py-1 rounded-md bg-elevated border border-rim shadow text-sm text-txt">
        {a().label}
      </span>
      <span class={`${ROUND} ${a().primary ? "text-accent-txt" : ""}`}>{actionIcon(a())}</span>
    </>
  );
  return a().href ? (
    <a href={a().href} download={a().download} title={a().title} class={cls} onClick={props.onPick}>
      {body()}
    </a>
  ) : (
    <button
      type="button"
      title={a().title}
      disabled={a().disabled}
      class={cls}
      onClick={() => { props.onPick(); a().onClick?.(); }}
    >
      {body()}
    </button>
  );
}

function MainButton(props: { action: PageAction }) {
  const a = () => props.action;
  const cls = `${ROUND} text-accent-txt`;
  const icon = () => actionIcon(a());
  return a().href ? (
    <a href={a().href} download={a().download} title={a().label} aria-label={a().label} class={cls}>
      {icon()}
    </a>
  ) : (
    <button type="button" title={a().label} aria-label={a().label} disabled={a().disabled} class={cls} onClick={() => a().onClick?.()}>
      {icon()}
    </button>
  );
}

/** The search field, docked just above the bottom bar. Submitting hands the
 * query to the page and closes. */
function SearchBar(props: { search: PageSearch; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = createSignal(props.search.value);

  return (
    <form
      role="search"
      class="fixed inset-x-0 bottom-16 lg:bottom-0 z-[56] flex items-center gap-2 px-3 py-2
             bg-surface border-t border-rim shadow-2xl"
      onSubmit={(e) => {
        e.preventDefault();
        props.search.onSearch(q().trim());
        props.onClose();
      }}
    >
      <MdOutlineSearch size={18} class="text-muted shrink-0" />
      <input
        type="search"
        ref={(el) => requestAnimationFrame(() => el.focus())}
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        onKeyDown={(e) => e.key === "Escape" && props.onClose()}
        placeholder={props.search.placeholder ?? t("layout.search")}
        aria-label={props.search.placeholder ?? t("layout.search")}
        class="flex-1 min-w-0 bg-transparent text-sm text-txt placeholder:text-muted focus:outline-none"
      />
      <Show when={props.search.value && props.search.onClear}>
        <IconButton
          label={t("layout.clear_search")}
          size="sm"
          onClick={() => { props.search.onClear?.(); props.onClose(); }}
        >
          <MdOutlineClose size={16} />
        </IconButton>
      </Show>
      <IconButton label={t("layout.close")} size="sm" onClick={props.onClose}>
        <MdOutlineExpand_less size={16} class="rotate-180" />
      </IconButton>
    </form>
  );
}
