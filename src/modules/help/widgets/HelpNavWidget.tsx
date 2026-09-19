// src/modules/help/widgets/HelpNavWidget.tsx
import { createSignal, createEffect, Show, For } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useLocation, A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchNav, type NavNode } from "../api";
import { MdOutlineChevron_right } from "solid-icons/md";

function NavItem(props: {
  node: NavNode;
  section: string;
  activePath: string;
  depth: number;
}) {
  const isActive = () => props.activePath === props.node.path;
  const anyChildActive = () =>
    props.activePath.startsWith(props.node.path + "/");
  const [open, setOpen] = createSignal(isActive() || anyChildActive());

  // Keep open when a child becomes active
  createEffect(() => {
    if (anyChildActive()) setOpen(true);
  });

  const href = `/help/${props.section}/${props.node.path}`;
  const hasChildren = props.node.children.length > 0;
  const indent = `${props.depth * 12}px`;

  return (
    <li>
      <div class="flex items-center gap-1" style={{ "padding-left": indent }}>
        {/* Expand toggle — only shown when has children */}
        <Show when={hasChildren} fallback={<span class="w-4 shrink-0" />}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            class="w-4 h-4 shrink-0 flex items-center justify-center
                   text-subtle hover:text-txt transition-colors rounded"
          >
            <MdOutlineChevron_right class={`w-2.5 h-2.5 transition-transform ${open() ? "rotate-90" : ""}`} />
          </button>
        </Show>

        <Show
          when={props.node.hasContent}
          fallback={
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              class={`flex-1 text-left text-xs py-1 px-1.5 rounded transition-colors
                ${isActive() ? "text-accent font-semibold" : "text-muted hover:text-txt font-medium"}`}
            >
              {props.node.label}
            </button>
          }
        >
          <A
            href={href}
            class={`flex-1 text-xs py-1 px-1.5 rounded transition-colors truncate
              ${
                isActive()
                  ? "text-accent font-semibold bg-accent-muted"
                  : "text-muted hover:text-txt hover:bg-elevated"
              }`}
          >
            {props.node.label}
          </A>
        </Show>
      </div>

      <Show when={hasChildren && open()}>
        <ul class="mt-0.5">
          <For each={props.node.children}>
            {(child) => (
              <NavItem
                node={child}
                section={props.section}
                activePath={props.activePath}
                depth={props.depth + 1}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}

function NavSkeleton() {
  return (
    <div class="px-4 py-3 space-y-2 animate-pulse">
      <For each={Array(6).fill(0)}>
        {(_, i) => (
          <div
            class="h-3 bg-elevated rounded"
            style={{
              width: `${60 + (i() % 3) * 15}%`,
              "margin-left": `${(i() % 2) * 12}px`,
            }}
          />
        )}
      </For>
    </div>
  );
}

export default function HelpNavWidget() {
  const { t, locale } = useI18n();
  const location = useLocation();

  // pathname: "/help/<section>/<...topic>" — drop the leading "/help" segment
  const parts = () => location.pathname.split("/").filter(Boolean).slice(1);
  const section = () => parts()[0] || "user";
  const topic = () => parts().slice(1).join("/");
  const lang = () => locale().split("-")[0]; // "en-US" → "en"

  const [navData] = createQueryResource(
    "help-nav",
    () => ({ section: section(), lang: lang() }),
    ({ section, lang }) => fetchNav(section, lang),
  );

  return (
    <div class="bg-surface border border-rim rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div class="px-4 pt-3.5 pb-3 flex items-center gap-2">
        <svg class="w-4 h-4 text-accent shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
            d="M4 6a2 2 0 012-2h9a2 2 0 012 2v13.5a.5.5 0 01-.5.5H7a3 3 0 01-3-3V6z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
            d="M7 18a3 3 0 013-3h7" />
        </svg>
        <h3 class="text-sm font-semibold text-txt flex-1">{t("widgets.help_nav")}</h3>
      </div>

      <Show when={!navData.loading} fallback={<NavSkeleton />}>
        <Show when={navData()} keyed>
          {(d) => (
            <ul class="px-3 pb-3.5 space-y-0.5 max-h-[60vh] overflow-y-auto">
              <For each={d.tree}>
                {(node) => (
                  <NavItem
                    node={node}
                    section={section()}
                    activePath={topic()}
                    depth={0}
                  />
                )}
              </For>
            </ul>
          )}
        </Show>
      </Show>
    </div>
  );
}
