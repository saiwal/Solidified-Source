import { createEffect, createSignal, lazy, on, onCleanup, onMount, Show, Suspense, type JSX } from "solid-js";
import { useLocation } from "@solidjs/router";
import { MdFillEdit, MdOutlineClose, MdOutlineExpand_less, MdOutlineSearch } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { ViewerRole } from "@utsukta/spa-core/store/site-config";
import { IconButton } from "@ui/Button";
import { Sheet } from "@ui/Sheet";
import { moduleCategory } from "./app-categories";
import {
  floatingAction, mobilePrimary, pageMenuGroups, pageMenuUnplaced, pageSearch,
  PageMenuButton, useMobileActions, type PageAction, type PageSearch,
} from "./PageActions";

// Loaded only when compose opens, so it stays out of the shell bundle.
const QuickCompose = lazy(() => import("@/modules/hq/widgets/QuickComposeWidget"));

const ROUND =
  "w-10 h-10 rounded-full flex items-center justify-center bg-elevated border border-rim " +
  "shadow hover:shadow-md transition-all disabled:opacity-60";

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || el.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select"));

/**
 * The floating column bottom-right, bottom to top: the page's main action,
 * search, the ⋮ menu when no title row holds it, scroll-to-top. One flex
 * column, so the buttons stack without per-button offsets.
 *
 * Main action: on mobile the page's innermost `primary` PageAction (falling
 * back to Compose for the owner in social apps); elsewhere a form's Save
 * (`useFloatingAction`). Search and the ⋮ are mobile-only — desktop keeps them
 * inline. While a text field has focus on mobile (the keyboard is up) the
 * column hides.
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

  const [composeOpen, setComposeOpen] = createSignal(false);
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [typing, setTyping] = createSignal(false);
  // A navigation hands the page (and its search) over to the next one.
  createEffect(on(() => location.pathname, () => { setSearchOpen(false); setComposeOpen(false); }, { defer: true }));

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
      ? { label: t("layout.compose"), icon: MdFillEdit, onClick: () => setComposeOpen(true) }
      : undefined;

  const main = () => (mobile() ? mobilePrimary() ?? compose() : floatingAction());
  const search = () => (mobile() ? pageSearch() : undefined);
  const floatingMenu = () => mobile() && pageMenuUnplaced() && pageMenuGroups().length > 0;
  const hidden = () => mobile() && typing() && !searchOpen();

  return (
    <>
      <div
        class={`fixed z-50 right-4 lg:right-6 bottom-[4.5rem] lg:bottom-20 xl:bottom-8
               ${props.hidesRightSidebar ? "xl:right-6" : "xl:right-[19.5rem]"}
               flex flex-col-reverse items-end gap-2`}
        classList={{ invisible: hidden() }}
      >
        <Show when={main()}>{(a) => <MainButton action={a()} />}</Show>

        <Show when={search()}>
          <button
            type="button"
            class={`${ROUND} ${search()!.value ? "text-accent-txt" : ""}`}
            aria-label={search()!.placeholder ?? t("layout.search")}
            aria-expanded={searchOpen()}
            onClick={() => setSearchOpen(true)}
          >
            <MdOutlineSearch size={18} />
          </button>
        </Show>

        <Show when={floatingMenu()}>
          <PageMenuButton floating class={ROUND} />
        </Show>

        <Show when={props.showScrollTop}>
          <button type="button" class={ROUND} aria-label={t("layout.scroll_top")} onClick={props.onScrollTop}>
            <MdOutlineExpand_less class="w-4 h-4" />
          </button>
        </Show>
      </div>

      <Show when={searchOpen() && search()}>
        {(s) => <SearchBar search={s()} onClose={() => setSearchOpen(false)} />}
      </Show>

      <Show when={composeOpen()}>
        <Sheet side="bottom" label={t("layout.quick_compose")} onClose={() => setComposeOpen(false)} class="p-4 pb-6">
          <Suspense fallback={<div class="h-10" />}>
            <QuickCompose />
          </Suspense>
        </Sheet>
      </Show>
    </>
  );
}

function MainButton(props: { action: PageAction }) {
  const a = () => props.action;
  const cls = `${ROUND} text-accent-txt`;
  const icon = (): JSX.Element => a().icon?.({ size: 18 }) ?? <span class="text-xs font-semibold">{a().label.slice(0, 1)}</span>;
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
