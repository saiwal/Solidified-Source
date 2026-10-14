import { For } from "solid-js";
import { A } from "@solidjs/router";
import { MdFillArrow_back } from "solid-icons/md";

// The quiet control vocabulary from design-guidelines.md. Secondary actions
// are bare icons; the one primary action on a screen is a filled pill. No
// outlined boxes: space and tone do the grouping.
export const iconBtn =
  "inline-flex items-center justify-center p-2 rounded-full text-muted hover:text-txt hover:bg-elevated/70 " +
  "transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent";
export const primaryPill =
  "inline-flex items-center gap-2 h-10 px-5 rounded-full bg-accent text-accent-fg text-sm font-medium " +
  "hover:brightness-110 transition disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const ghostPill =
  "inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm text-muted hover:text-txt hover:bg-elevated/70 " +
  "transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-accent";

const bar = "rounded bg-elevated animate-pulse motion-reduce:animate-none";

/** Placeholder list rows, for anything shaped like a list. */
export function SkeletonRows(props: { count?: number }) {
  return (
    <div class="space-y-0.5">
      <For each={Array.from({ length: props.count ?? 8 })}>
        {(_, i) => (
          <div class="flex items-center gap-3 px-3 py-2.5">
            <div class={`h-3 w-5 ${bar}`} />
            <div class="flex-1 space-y-1.5">
              <div class={`h-3 ${bar}`} style={{ width: `${55 + ((i() * 17) % 35)}%` }} />
              <div class={`h-2.5 w-1/3 ${bar}`} />
            </div>
            <div class={`h-3 w-8 ${bar}`} />
          </div>
        )}
      </For>
    </div>
  );
}

/**
 * "Back" to wherever the reader came from, when that was this site; a link to
 * `fallback` otherwise (a shared link opened cold has nothing to go back to,
 * and history.back() would leave the site). Navigation API where available.
 */
export function BackLink(props: { fallback: string; label: string }) {
  const nav = (window as { navigation?: { currentEntry?: { index: number } } }).navigation;
  return (
    <A href={props.fallback}
      onClick={(e) => { if ((nav?.currentEntry?.index ?? 0) > 0) { e.preventDefault(); history.back(); } }}
      class="inline-flex items-center gap-1.5 -ml-1 px-1 py-1 rounded-lg text-sm text-muted hover:text-txt transition-colors">
      <MdFillArrow_back size={16} /> {props.label}
    </A>
  );
}
