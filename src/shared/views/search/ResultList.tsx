// One grouped result list for the palette and the drawer. Rows are links (so
// middle-click/new tab works); `active` + ids drive the palette's
// aria-activedescendant keyboard focus.
import { For, Show, type JSX } from "solid-js";

export interface Entry {
  key: string;
  group: string;
  title: string;
  subtitle?: string;
  href: string;
  external?: boolean;
  icon: JSX.Element;
}

export const entryId = (prefix: string, i: number) => `${prefix}-opt-${i}`;

export default function ResultList(props: {
  entries: Entry[];
  idPrefix: string;
  active?: number;
  onPick: (e: Entry, ev: MouseEvent) => void;
  onHover?: (i: number) => void;
}) {
  return (
    <ul id={`${props.idPrefix}-list`} role="listbox" class="py-1">
      <For each={props.entries}>
        {(e, i) => (
          <>
            <Show when={i() === 0 || props.entries[i() - 1].group !== e.group}>
              <li role="presentation"
                class="px-4 pt-3 pb-1 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
                {e.group}
              </li>
            </Show>
            <li role="presentation">
              <a
                id={entryId(props.idPrefix, i())}
                role="option"
                aria-selected={props.active === i()}
                href={e.href}
                target={e.external ? "_blank" : undefined}
                rel={e.external ? "noopener noreferrer" : undefined}
                onClick={(ev) => props.onPick(e, ev)}
                onMouseMove={() => props.onHover?.(i())}
                class={`flex items-start gap-3 px-4 py-2 text-sm transition-colors
                  ${props.active === i() ? "bg-accent-muted text-accent-txt" : "text-txt hover:bg-elevated"}`}
              >
                <span class="shrink-0 mt-0.5 text-muted" aria-hidden="true">{e.icon}</span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{e.title}</span>
                  <Show when={e.subtitle}>
                    <span class="block text-xs text-muted line-clamp-2 break-words">{e.subtitle}</span>
                  </Show>
                </span>
              </a>
            </li>
          </>
        )}
      </For>
    </ul>
  );
}
