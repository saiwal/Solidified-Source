import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createMediaQuery } from "@solid-primitives/media";
import { MdOutlineMore_horiz } from "solid-icons/md";
import type { IconTypes } from "solid-icons";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button, buttonClass, IconButton } from "@ui/Button";
import { Menu, MenuItem } from "@ui/Menu";

/** One of a module header's common actions. */
export interface PageAction {
  label: string;
  icon?: IconTypes;
  onClick?: () => void;
  /** Renders a link instead of a button. */
  href?: string;
  download?: string;
  title?: string;
  disabled?: boolean;
  /** The view's main action: a filled button on desktop. */
  primary?: boolean;
  /** Behind the "More" menu on desktop; a plain row on mobile like the rest. */
  overflow?: boolean;
  /** false hides it. */
  show?: boolean;
}

/**
 * A module header's common actions, declared as data so each place can render
 * them its own way: buttons (plus a "More" menu for `overflow` ones) inline on
 * desktop, rows in the mobile nav's contextual-actions sheet below `lg` (see
 * `MobileMenu.tsx`). Navigation (Tabs) and inline search stay in the header —
 * they aren't actions.
 */

const [sources, setSources] = createSignal<(() => PageAction[])[]>([]);

/** The visible actions of every mounted PageActions, for the mobile sheet. */
export function pageActions(): PageAction[] {
  return sources().flatMap((s) => s()).filter((a) => a.show !== false);
}

/** True while the active page's module has action controls to show. */
export function hasPageActions(): boolean {
  return pageActions().length > 0;
}

// Set from Layout.tsx whenever the mobile nav chrome (and therefore the
// actions sheet) is on screen. Without it, chrome modes that hide the nav
// ("focus"/"compact") would move header actions into a sheet that isn't
// mounted, silently hiding them — so they render inline in that case.
const [mobileNavAvailable, setMobileNavAvailable] = createSignal(false);
export { setMobileNavAvailable };

export default function PageActions(props: { actions: PageAction[]; class?: string }) {
  const { t } = useI18n();
  const isDesktop = createMediaQuery("(min-width: 1024px)");
  const inline = () => isDesktop() || !mobileNavAvailable();

  // Only registered while inline is off, so a desktop header doesn't light
  // up the (hidden) mobile actions button.
  // Registered in onMount, not during render: the router renders the next
  // page inside a transition, and a write made there forks `sources` with the
  // outgoing page's entry still in it. Committing that fork could undo the
  // outgoing page's cleanup, so its actions stayed in the sheet next to the
  // new page's. onMount runs only after the transition commits.
  const source = () => (inline() ? [] : props.actions);
  onMount(() => {
    setSources((s) => [...s, source]);
    onCleanup(() => setSources((s) => s.filter((x) => x !== source)));
  });

  const visible = () => props.actions.filter((a) => a.show !== false);
  const main = () => visible().filter((a) => !a.overflow);
  const more = () => visible().filter((a) => a.overflow);

  return (
    <Show when={inline() && visible().length}>
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
  );
}
