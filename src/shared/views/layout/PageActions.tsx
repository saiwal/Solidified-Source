import { createContext, createEffect, createSignal, For, onCleanup, onMount, Show, useContext } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { MdOutlineMore_horiz } from "solid-icons/md";
import type { IconTypes } from "solid-icons";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button, buttonClass, IconButton } from "@ui/Button";
import { Menu, MenuItem } from "@ui/Menu";

/** One of a page's common actions. */
export interface PageAction {
  label: string;
  icon?: IconTypes;
  onClick?: () => void;
  /** Renders a link instead of a button. */
  href?: string;
  download?: string;
  title?: string;
  disabled?: boolean;
  /** The view's main action: a filled button on desktop, the floating
   *  button on mobile. */
  primary?: boolean;
  /** Behind the "More" menu on desktop. On mobile every non-primary action
   *  is in the page's ⋮ menu anyway. */
  overflow?: boolean;
  /** false hides it. */
  show?: boolean;
}

/**
 * A page's common actions, declared as data so each place can render them its
 * own way. Desktop: buttons inline where the PageActions sits (plus a "More"
 * menu for `overflow` ones). Mobile (below lg, with the nav bar): the page's
 * actions from every mounted PageActions, plus the page search
 * (`usePageSearch`), fan out of one floating "more" button (FloatingActions.tsx),
 * the innermost `primary` first. Navigation (Tabs) isn't an action.
 */

interface Source {
  label?: () => string | undefined;
  actions: () => PageAction[];
}

// Registered in onMount, not during render: the router renders the next page
// inside a transition, and a write made there forks the signal with the
// outgoing page's entry still in it. Committing that fork could undo the
// outgoing page's cleanup, so its actions stayed next to the new page's.
// onMount runs only after the transition commits. Same for every registry here.
function useRegistration<T>(set: (fn: (s: T[]) => T[]) => void, item: T) {
  onMount(() => {
    set((s) => [...s, item]);
    onCleanup(() => set((s) => s.filter((x) => x !== item)));
  });
}

const [sources, setSources] = createSignal<Source[]>([]);

const visibleOf = (s: Source) => s.actions().filter((a) => a.show !== false);

/** The floating button's action: the innermost (last mounted) primary — a
 * section's over its module header's. */
export function mobilePrimary(): PageAction | undefined {
  const i = primarySource();
  return i < 0 ? undefined : visibleOf(sources()[i]).find((a) => a.primary);
}

// Index of the source holding the floating action. Matched by position, not
// identity: `actions` is usually a JSX array literal, so every read of it
// builds fresh objects and `a !== mobilePrimary()` never holds.
function primarySource(): number {
  const all = sources();
  for (let i = all.length - 1; i >= 0; i--) if (visibleOf(all[i]).some((a) => a.primary)) return i;
  return -1;
}

/** One ⋮ menu group. */
export interface PageActionGroup {
  label?: string;
  actions: PageAction[];
}

/** Everything but the floating action, grouped in mount order; sources
 * sharing a label are one group (a section's header button and a mobileOnly
 * toolbar further down it). */
export function pageMenuGroups(): PageActionGroup[] {
  const pi = primarySource();
  const groups: PageActionGroup[] = [];
  for (const [i, s] of sources().entries()) {
    const label = s.label?.();
    let actions = visibleOf(s);
    if (i === pi) {
      const j = actions.findIndex((a) => a.primary);
      actions = actions.filter((_, k) => k !== j);
    }
    if (!actions.length) continue;
    const g = groups.find((x) => x.label === label);
    if (g) g.actions.push(...actions);
    else groups.push({ label, actions });
  }
  return groups;
}

/** Default group label for every PageActions below it — SubPageContent
 * provides its title, so a section's actions read apart from the module's. */
export const PageActionsLabel = createContext<() => string | undefined>();

// Set from Layout.tsx whenever the mobile nav chrome is on screen. Chrome
// modes that hide the nav ("focus"/"compact") keep the desktop rendering, so
// actions never move into chrome that isn't there.
const [mobileNavAvailable, setMobileNavAvailable] = createSignal(false);
export { setMobileNavAvailable };

/** True where actions leave the page for the floating button and the ⋮ menu.
 * A view that keeps its own inline controls on desktop hides them while this
 * holds and hands them over through a `mobileOnly` PageActions. */
export function useMobileActions(): () => boolean {
  const isDesktop = createMediaQuery("(min-width: 1024px)");
  return () => !isDesktop() && mobileNavAvailable();
}

/** A form's Save on desktop: Layout floats it above scroll-to-top. Set by
 * SaveBar (on mobile its Save is simply the page's primary action). */
const [floatingAction, setFloatingAction] = createSignal<PageAction>();
export { floatingAction };

/** Floats `action()` for as long as the calling component is mounted. */
export function useFloatingAction(action: () => PageAction | undefined) {
  onMount(() => {
    createEffect(() => setFloatingAction(action()));
    onCleanup(() => setFloatingAction(undefined));
  });
}

// ── Search ──────────────────────────────────────────────────────────────────

/** A page's search, offered in the floating "more" column on mobile. */
export interface PageSearch {
  /** The active query, shown when the field opens. */
  value: string;
  placeholder?: string;
  onSearch: (q: string) => void;
  /** Clears the active query; offered while `value` is set. */
  onClear?: () => void;
}

const [searches, setSearches] = createSignal<(() => PageSearch | undefined)[]>([]);

/** The innermost mounted page search, if any. */
export function pageSearch(): PageSearch | undefined {
  const all = searches();
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i]();
    if (s) return s;
  }
  return undefined;
}

/** Offers this view's search in the floating "more" column while mounted, on
 * mobile only — hide the inline search toggle while `useMobileActions()`. */
export function usePageSearch(search: () => PageSearch | undefined) {
  const mobile = useMobileActions();
  useRegistration(setSearches, () => (mobile() ? search() : undefined));
}

// ── PageActions ─────────────────────────────────────────────────────────────

export default function PageActions(props: {
  actions: PageAction[];
  class?: string;
  /** Heading of this group in the ⋮ menu — a section's or item view's name,
   *  so its actions read apart from the module header's. */
  label?: string;
  /** Mobile only, never inline: for views that keep their own controls on
   *  desktop (a toolbar's icon buttons) and hide them on mobile. */
  mobileOnly?: boolean;
}) {
  const { t } = useI18n();
  const mobile = useMobileActions();
  const contextLabel = useContext(PageActionsLabel);

  // Only registered on mobile, so a desktop header doesn't feed the (hidden)
  // floating button and ⋮.
  useRegistration(setSources, {
    label: () => props.label ?? contextLabel?.(),
    actions: () => (mobile() ? props.actions : []),
  });

  const visible = () => props.actions.filter((a) => a.show !== false);
  const main = () => visible().filter((a) => !a.overflow);
  const more = () => visible().filter((a) => a.overflow);

  return (
    <Show when={!mobile()}>
      <Show when={!props.mobileOnly && visible().length}>
        <div class={`flex items-center gap-1.5 ${props.class ?? ""}`}>
          <For each={main()}>
            {(a) => {
              const variant = a.primary ? "primary" : "ghost";
              const body = (
                <>
                  {a.icon?.({ size: 16 })}
                  {a.label}
                </>
              );
              return a.href ? (
                <a href={a.href} download={a.download} title={a.title} class={`${buttonClass(variant, "sm")} gap-1.5`}>
                  {body}
                </a>
              ) : (
                <Button variant={variant} size="sm" class="gap-1.5" title={a.title} disabled={a.disabled} onClick={() => a.onClick?.()}>
                  {body}
                </Button>
              );
            }}
          </For>
          <Show when={more().length}>
            <Menu
              label={t("layout.more")}
              class="w-64"
              trigger={(p) => (
                <IconButton label={t("layout.more")} variant="outline" {...p}>
                  <MdOutlineMore_horiz size={15} />
                </IconButton>
              )}
            >
              <For each={more()}>
                {(a) => (
                  <MenuItem
                    icon={a.icon ? a.icon({ size: 16 }) : <span />}
                    href={a.href}
                    download={a.download}
                    title={a.title}
                    disabled={a.disabled}
                    onClick={() => a.onClick?.()}
                  >
                    <span class="min-w-0 truncate">{a.label}</span>
                  </MenuItem>
                )}
              </For>
            </Menu>
          </Show>
        </div>
      </Show>
    </Show>
  );
}
