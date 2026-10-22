// src/shared/views/ArticleToc.tsx
// Drop-in table-of-contents for long-form content (articles, help topics,
// webpages, …). Renders as a sticky sidebar column on xl+ and as a sticky
// collapsed launcher below xl. Place it as a sibling of the content column
// inside an `xl:flex xl:gap-8` container, BEFORE that column in JSX — both
// pieces are position:sticky now, so DOM order drives the below-xl stacked
// position (the launcher must precede the content to sit above it); the
// xl+ sidebar stays visually last via `order-last` regardless.
import { createSignal, Show, For } from "solid-js";
import { MdOutlineToc } from "solid-icons/md";
import type { TocEntry } from "@utsukta/spa-core/lib/useToc";
import { IconButton } from "@ui/Button";

function indentClass(level: number, minLevel: number): string {
  const d = level - minLevel;
  return d === 0 ? "" : d === 1 ? "pl-3" : "pl-6";
}

function TocLinks(props: {
  entries: TocEntry[];
  activeId: string;
  onNavigate?: () => void;
}) {
  const minLevel = () => Math.min(...props.entries.map((e) => e.level));
  return (
    <For each={props.entries}>
      {(entry) => (
        <a
          href={`#${entry.id}`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth" });
            props.onNavigate?.();
          }}
          class={`block text-xs py-0.5 px-1 rounded transition-colors truncate
            ${indentClass(entry.level, minLevel())}
            ${props.activeId === entry.id
              ? "text-accent font-medium"
              : "text-muted hover:text-txt"
            }`}
        >
          {entry.text}
        </a>
      )}
    </For>
  );
}

// ── xl+ sticky sidebar ───────────────────────────────────────────────────────

function FixedToc(props: { entries: TocEntry[]; activeId: string; label: string }) {
  return (
    <nav
      class="xl:sticky xl:top-6 xl:w-52"
      aria-label={props.label}
    >
      <span class="text-xs font-semibold uppercase tracking-wide text-muted">
        {props.label}
      </span>
      <div class="mt-2 space-y-0.5 max-h-[70vh] overflow-y-auto">
        <TocLinks entries={props.entries} activeId={props.activeId} />
      </div>
    </nav>
  );
}

// ── below-xl floating collapsed launcher ────────────────────────────────────

function FloatingToc(props: { entries: TocEntry[]; activeId: string; label: string }) {
  const [open, setOpen] = createSignal(false);

  return (
    <div class="xl:hidden sticky top-2 z-10 mb-3 flex justify-end">
      <div class="flex flex-col items-end">
        <IconButton
          label={props.label}
          variant="outline"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open()}
        >
          <MdOutlineToc size={20} />
        </IconButton>
        <Show when={open()}>
          <div
            class="mt-2 w-64 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto
                   bg-surface border border-rim rounded-xl shadow-2xl p-3"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-muted">
                {props.label}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close table of contents"
                class="p-1 rounded text-muted hover:bg-elevated hover:text-txt transition-colors"
              >
                ✕
              </button>
            </div>
            <div class="space-y-0.5">
              <TocLinks
                entries={props.entries}
                activeId={props.activeId}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ── combined drop-in ─────────────────────────────────────────────────────────

export default function ArticleToc(props: { entries: TocEntry[]; activeId: string; label: string }) {
  return (
    <Show when={props.entries.length > 1}>
      <FloatingToc entries={props.entries} activeId={props.activeId} label={props.label} />
      <aside class="hidden xl:block xl:order-last shrink-0 w-52">
        <FixedToc entries={props.entries} activeId={props.activeId} label={props.label} />
      </aside>
    </Show>
  );
}
