// settings/store/FormHelpers.tsx
import { Show, type JSX } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";

export function SaveBar(props: { saving: boolean }) {
  const { t } = useI18n();
  return (
    <div class="flex items-center gap-3 pt-2 border-t border-rim">
      <button
        type="submit"
        disabled={props.saving}
        class="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-accent-fg
               hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {props.saving ? t("settings.saving") : t("settings.save")}
      </button>
    </div>
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

export function Field(props: { label: string; hint?: string; children: any }) {
  return (
    <div class="space-y-1.5">
      <label class="block text-sm font-medium text-txt">{props.label}</label>
      {props.children}
      <Show when={props.hint}>
        <p class="text-xs text-muted">{props.hint}</p>
      </Show>
    </div>
  );
}

export function Toggle(props: { name: string; label: string; hint?: string; checked: boolean }) {
  return (
    <label class="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        name={props.name}
        value="1"
        checked={props.checked}
        class="mt-0.5 h-4 w-4 rounded border-rim accent-accent cursor-pointer"
      />
      <span class="flex-1 min-w-0">
        <span class="block text-sm text-txt">{props.label}</span>
        <Show when={props.hint}>
          <span class="block text-xs text-muted">{props.hint}</span>
        </Show>
      </span>
    </label>
  );
}

export const inputClass = `w-full px-3 py-2 rounded-lg border border-rim bg-surface text-txt text-sm
  placeholder:text-muted hover:border-rim-strong focus:outline-none
  focus:border-rim-strong transition-colors`;

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
    <section class="rounded-xl border border-rim bg-surface">
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

/**
 * A real <input type="checkbox"> styled as a switch, so forms keep their
 * plain FormData submit semantics (present = "1", absent = unchecked).
 */
export function SwitchRow(props: {
  name: string; label: string; hint?: string; checked: boolean;
  /** Only for switches outside a submitted form — inside one, FormData reads it. */
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label class="flex items-center justify-between gap-4 py-2.5 cursor-pointer select-none">
      <span class="min-w-0">
        <span class="block text-sm text-txt">{props.label}</span>
        <Show when={props.hint}>
          <span class="block text-xs text-muted">{props.hint}</span>
        </Show>
      </span>
      <input
        type="checkbox"
        name={props.name}
        value="1"
        checked={props.checked}
        onChange={(e) => props.onChange?.(e.currentTarget.checked)}
        class="appearance-none relative h-6 w-11 shrink-0 cursor-pointer rounded-full
               bg-elevated border border-rim transition-colors
               checked:bg-accent checked:border-accent
               after:absolute after:top-1/2 after:-translate-y-1/2 after:translate-x-1
               after:h-4 after:w-4 after:rounded-full after:bg-muted
               after:transition-transform after:duration-150 motion-reduce:after:transition-none
               checked:after:translate-x-6 checked:after:bg-accent-fg
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60
               focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      />
    </label>
  );
}
