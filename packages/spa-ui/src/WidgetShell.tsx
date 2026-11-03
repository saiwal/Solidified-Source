// solidified's widget frames (contract: WidgetShellProps in spa-core
// types/ui.types.ts). WidgetShell renders the look the user picked in
// Settings → Display. Every look is one entry in LOOKS: class strings for the
// root/header/title/footer plus a few structural flags (panel, legend, fold, rail).
// Adding one = an entry here + its id in WIDGET_SHELLS (lib/widget-shell.ts)
// + an i18n label + HubDefaults::CHOICES.
//
// Each root sets --ws-px, the horizontal inset widget bodies pad with
// (`px-(--ws-px)`); :root defaults it to 1rem for anything outside a shell.
// Class strings stay literal so Tailwind's scanner sees them.
import { Show, children, createSignal, useContext, type JSX } from "solid-js";
import type { WidgetShellProps } from "@utsukta/spa-core/types/ui.types";
import {
  WidgetKeyContext,
  isFolded,
  setWidgetFolded,
  widgetShell,
  type WidgetShellId,
} from "@utsukta/spa-core/lib/widget-shell";
import { cardClass, cardHeaderClass } from "@ui/Card";

interface Look {
  root: string;
  header: string;
  title: string;
  footer: string;
  actions?: string;
  /** Hide the icon slot (the look has its own title mark). */
  noIcon?: true;
  /** Accent tick before the title. */
  rail?: true;
  /** Body + footer sit in a wrapper with these classes (titled or not). */
  panel?: (titled: boolean) => string;
  /** Header draws the outline's top edge around the title (legend). */
  legend?: true;
  /** Title toggles the body. */
  fold?: true;
}

const TITLE = "flex-1 min-w-0 truncate font-semibold text-txt";

// Flush to the sidebar edge under a rule. No fill on purpose: the right
// sidebar is itself bg-surface, so a surface fill there is invisible.
const SECTION_ROOT = "group/ws overflow-hidden border-t border-rim-strong pt-0.5 [--ws-px:0.25rem]";
const SECTION_HEADER = "gap-2 min-h-10 px-(--ws-px) pt-2 pb-0.5";
const SECTION_ACTIONS =
  "transition-opacity [@media(hover:hover)]:opacity-60 group-hover/ws:opacity-100 group-focus-within/ws:opacity-100";
const SECTION_FOOTER = "justify-end px-(--ws-px) pt-0.5 pb-2";

const LOOKS: Record<WidgetShellId, Look> = {
  card: {
    root: `${cardClass()} overflow-hidden [--ws-px:1rem]`,
    header: `${cardHeaderClass} gap-2`,
    title: `${TITLE} text-sm`,
    footer: "border-t border-rim px-4 py-2",
  },
  section: {
    root: SECTION_ROOT,
    header: SECTION_HEADER,
    title: `${TITLE} text-[0.8125rem]`,
    actions: SECTION_ACTIONS,
    footer: SECTION_FOOTER,
  },
  banded: {
    root: `${cardClass()} overflow-hidden [--ws-px:1rem]`,
    header: "gap-2 px-4 py-2.5 bg-elevated border-b border-rim",
    title: `${TITLE} text-[0.8125rem]`,
    footer: "justify-end px-4 py-2 bg-elevated border-t border-rim",
  },
  rail: {
    // elevated, not surface: the sidebar is surface (see SECTION_ROOT).
    root: "bg-elevated rounded-xl overflow-hidden [--ws-px:1rem]",
    header: "gap-2 px-4 pt-3.5 pb-1",
    title: `${TITLE} text-[0.8125rem]`,
    footer: "px-4 pt-1 pb-3.5",
    noIcon: true,
    rail: true,
  },
  glass: {
    root:
      "rounded-2xl overflow-hidden [--ws-px:1rem] bg-elevated/55 backdrop-blur-lg backdrop-saturate-125 " +
      "border border-txt/10 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.25)]",
    header: "gap-2 px-4 pt-3 pb-0.5",
    title: `${TITLE} text-[0.8125rem]`,
    footer: "px-4 pt-1 pb-3",
  },
  // The outline's top edge is drawn by the header itself — corner, title,
  // line, actions, corner — so the title interrupts the line without a
  // background patch behind it, and it works over a wallpaper too.
  legend: {
    root: "[--ws-px:1rem]",
    // Fixed height, not min-h: the corner pieces size with a % of it.
    header: "h-7",
    title: "min-w-0 truncate px-1.5 text-xs font-semibold text-txt",
    actions: "px-1",
    footer: "justify-end px-4 pt-0.5 pb-2.5",
    noIcon: true,
    legend: true,
    panel: (titled) =>
      `overflow-hidden border-rim ${titled ? "rounded-b-xl border-x border-b" : "rounded-xl border"}`,
  },
  tab: {
    root: "[--ws-px:1rem]",
    header: "items-end gap-1.5",
    title:
      "relative top-px min-w-0 max-w-[75%] truncate rounded-t-[9px] border border-b-0 border-rim bg-surface " +
      "px-3 pt-1.5 pb-1 text-xs font-semibold text-txt",
    actions: "ml-auto pb-0.5",
    footer: "border-t border-rim px-4 py-2",
    noIcon: true,
    panel: (titled) => `${cardClass()} overflow-hidden ${titled ? "rounded-tl-none" : ""}`,
  },
  compact: {
    root: `${cardClass()} overflow-hidden rounded-lg [--ws-px:0.75rem]`,
    header: "gap-2 min-h-8 px-3 py-1 border-b border-rim",
    title: `${TITLE} text-xs`,
    footer: "border-t border-rim px-3 py-1.5",
  },
  fold: {
    root: SECTION_ROOT,
    header: SECTION_HEADER,
    title: `${TITLE} text-[0.8125rem]`,
    actions: SECTION_ACTIONS,
    footer: SECTION_FOOTER,
    noIcon: true,
    fold: true,
  },
};

const Chevron = (p: { open: boolean }) => (
  <svg
    class={`w-3.5 h-3.5 shrink-0 text-muted transition-transform ${p.open ? "" : "-rotate-90"}`}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

// A JSX prop is a getter that builds fresh nodes on every read; children()
// builds them once and memoises, and an absent/empty slot resolves falsy.
const filled = (v: unknown) => (Array.isArray(v) ? (v.length ? v : undefined) : (v ?? undefined));

export function WidgetShell(props: WidgetShellProps) {
  const l = () => LOOKS[widgetShell()];
  const title = children(() => props.title);
  const icon = children(() => props.icon);
  const actions = children(() => props.actions);
  const footer = children(() => props.footer);
  const hasTitle = () => !!filled(title());

  // Fold state: remembered per placed widget when Slot gives us its key,
  // else local to this mount.
  const key = useContext(WidgetKeyContext);
  const [localFolded, setLocalFolded] = createSignal(false);
  const folded = () => !!l().fold && (key ? isFolded(key) : localFolded());
  const toggle = () => (key ? setWidgetFolded(key, !folded()) : setLocalFolded(!folded()));

  const heading = () =>
    l().fold ? (
      // Accordion pattern: the button lives inside the heading, not around it.
      <h3 class={l().title}>
        <button type="button" class="flex w-full min-w-0 items-center gap-1.5 rounded text-left" aria-expanded={!folded()} onClick={toggle}>
          <Chevron open={!folded()} />
          <span class="truncate">{title()}</span>
        </button>
      </h3>
    ) : (
      <h3 class={l().title}>{title()}</h3>
    );

  const body = (): JSX.Element => (
    <>
      {props.children}
      <Show when={filled(footer())}>
        <footer class={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${l().footer}`}>{footer()}</footer>
      </Show>
    </>
  );

  return (
    <section class={`${l().root} ${props.class ?? ""}`}>
      <Show when={hasTitle() || filled(actions())}>
        <header class={`flex items-center ${l().header}`}>
          <Show when={l().legend}>
            <span class="self-end h-[calc(50%+0.5px)] w-3 shrink-0 rounded-tl-xl border-l border-t border-rim" aria-hidden="true" />
          </Show>
          <Show when={!l().noIcon && filled(icon())}>
            <span class="shrink-0 text-muted" aria-hidden="true">{icon()}</span>
          </Show>
          <Show when={l().rail && hasTitle()}>
            <span class="w-[3px] h-[15px] shrink-0 rounded-sm bg-accent" aria-hidden="true" />
          </Show>
          <Show when={hasTitle()}>{heading()}</Show>
          <Show when={l().legend}>
            <span class="h-px flex-1 bg-rim" aria-hidden="true" />
          </Show>
          <Show when={filled(actions())}>
            <div class={`flex shrink-0 items-center gap-1 ${l().actions ?? ""}`}>{actions()}</div>
          </Show>
          <Show when={l().legend}>
            <span class="self-end h-[calc(50%+0.5px)] w-3 shrink-0 rounded-tr-xl border-r border-t border-rim" aria-hidden="true" />
          </Show>
        </header>
      </Show>
      <Show
        when={l().panel}
        fallback={
          // display:contents keeps a flex-column root (ScheduledPosts) laying
          // out the body's own children; [hidden] still wins for a fold.
          <div class="contents" hidden={folded()}>{body()}</div>
        }
      >
        {(panel) => <div class={panel()(hasTitle())}>{body()}</div>}
      </Show>
    </section>
  );
}
