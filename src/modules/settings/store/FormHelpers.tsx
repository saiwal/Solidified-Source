// settings/store/FormHelpers.tsx
import { type JSX } from "solid-js";
import { MdOutlineSave } from "solid-icons/md";
import PageActions, { useMobileActions, useFloatingAction } from "@/shared/views/layout/PageActions";
import { useI18n } from "@utsukta/spa-core/i18n";
import { cardClass } from "@ui/Card";

/**
 * A form's Save, always in reach without a bar over the page: the round
 * floating button above scroll-to-top — on mobile as the page's primary
 * PageAction, elsewhere through useFloatingAction. Renders nothing visible —
 * it must sit inside the <form> it submits. Admin passes its own labels.
 */
export function SaveBar(props: { saving: boolean; label?: string; savingLabel?: string }) {
  const { t } = useI18n();
  const mobileActions = useMobileActions();
  let anchor!: HTMLSpanElement;
  const action = () => ({
    label: props.saving ? (props.savingLabel ?? t("settings.saving")) : (props.label ?? t("settings.save")),
    icon: MdOutlineSave,
    primary: true,
    disabled: props.saving,
    onClick: () => anchor.closest("form")?.requestSubmit(),
  });
  useFloatingAction(() => (mobileActions() ? undefined : action()));
  return (
    <span ref={anchor} hidden>
      <PageActions mobileOnly actions={[action()]} />
    </span>
  );
}

export function Section(props: { title: string; children: any }) {
  return (
    <div class="space-y-3">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{props.title}</h3>
      <div class="space-y-2.5">{props.children}</div>
    </div>
  );
}

/**
 * Card-style settings group: icon chip + title + one-line description header,
 * rows below. `columns` splits the rows into two columns on md+ screens,
 * collapsing back to one column at "large"/"xl" font-size settings so row
 * labels don't overlap the toggle (see `font-scaled` variant in index.css).
 */
export function Group(props: {
  icon: JSX.Element;
  title: string;
  desc: string;
  columns?: boolean;
  children: JSX.Element;
}) {
  return (
    <section class={cardClass()}>
      <header class="flex items-center gap-3 px-4 py-3 border-b border-rim">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
          {props.icon}
        </span>
        <span class="min-w-0">
          <h3 class="text-sm font-semibold text-txt">{props.title}</h3>
          <p class="text-xs text-muted">{props.desc}</p>
        </span>
      </header>
      <div class={"px-4 py-1.5" + (props.columns ? " md:grid md:grid-cols-2 md:gap-x-10 font-scaled:grid-cols-1!" : "")}>
        {props.children}
      </div>
    </section>
  );
}
