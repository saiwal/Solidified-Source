import { createSignal, createEffect, on, For, Show, onMount } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { storageSet } from "@utsukta/spa-core/lib/storage";
import { channelKey } from "@utsukta/spa-core/store/auth-store";
import type { SavedDraft } from "../store/createComposerStore";
import { listServerDrafts, deleteServerDraft, draftsVersion } from "../api/drafts";
import { MdFillDelete, MdOutlineDescription, MdOutlineRefresh } from "solid-icons/md";
import { IconButton } from "@ui/Button";
import { WidgetShell } from "@ui/WidgetShell";

// Shared list UI behind the per-module drafts widgets (articles, webpages,
// wiki, …) — one card with header/skeleton/empty-state/list chrome, fetching
// and deleting drafts of a single scope-type prefix. Each module supplies the
// bits that differ: labels, badge styling/text, which entries are safely
// resumable, and what "load" means for its own composer (open a modal,
// navigate to a routed editor, …).

export type DraftEntry = { scope: string; draft: SavedDraft };

export interface DraftsWidgetApi {
  reload: () => Promise<void>;
}

export interface DraftsWidgetBaseProps {
  /** Scope prefix before the first ":" — also the `listServerDrafts` type
   *  filter. Comma-separated for several at once (the HQ widget lists all). */
  scopeType: string;
  title: string;
  emptyText: string;
  refreshTitle: string;
  deleteTitle: string;
  untitledText: string;
  emptyDraftText: string;
  /** Tailwind classes for the line-3 type/status badge — constant per widget,
   *  or per scope where one widget lists several types. */
  badgeClassName: string | ((scope: string) => string);
  badgeLabel: (scope: string) => string;
  /** Defaults to always-loadable when omitted */
  isLoadable?: (scope: string) => boolean;
  /** Called (after the pending-draft key is written) when a loadable entry is clicked */
  onLoad: (entry: DraftEntry) => void | Promise<void>;
  /** Escape hatch so a caller that owns a modal can force a refetch after saving */
  apiRef?: (api: DraftsWidgetApi) => void;
}

// Short absolute date — "Jul 30", falling back to a year suffix once it's stale
function formatDate(ms: number): string {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

const SkeletonRow = () => (
  <div class="px-(--ws-px) py-3 animate-pulse space-y-2">
    <div class="h-3.5 bg-overlay rounded w-2/3" />
    <div class="h-3 bg-overlay rounded w-4/5" />
    <div class="flex items-center justify-between pt-0.5">
      <div class="h-3.5 w-10 bg-overlay rounded" />
      <div class="h-3 w-10 bg-overlay rounded" />
    </div>
  </div>
);

export default function DraftsWidgetBase(props: DraftsWidgetBaseProps) {
  // Cached per scope: a remount (leaving HQ and coming back) or a reload shows
  // the list it already has and revalidates behind it — the skeleton is for
  // the very first load only.
  const [data, { refetch, mutate }] = createQueryResource(
    "drafts",
    () => props.scopeType,
    async (scopeType): Promise<DraftEntry[]> => {
      const types = scopeType.split(",");
      const results = (await listServerDrafts(scopeType))
        .filter((sd) => types.includes(sd.scope.split(":")[0]))
        .map((sd) => ({ scope: sd.scope, draft: { ...sd, id: sd.serverMid } }));
      results.sort((a, b) => b.draft.updated - a.draft.updated);
      return results;
    },
    // Drafts are saved from composers that never invalidate this.
    { staleTime: 0 },
  );
  const entries = () => data() ?? [];
  const loading = () => data() === undefined;
  const loadAll = async () => refetch();
  const [deleting, setDeleting] = createSignal<string | null>(null);

  const loadable = (scope: string) => (props.isLoadable ? props.isLoadable(scope) : true);

  onMount(() => props.apiRef?.({ reload: loadAll }));

  // A draft deleted elsewhere (e.g. published from a routed composer that
  // navigated here, leaving this widget mounted) still needs to drop off
  // this list — refetch whenever any draft is deleted server-side.
  createEffect(on(draftsVersion, () => void loadAll(), { defer: true }));

  async function deleteDraft(scope: string, id: string) {
    setDeleting(id);
    try {
      void deleteServerDraft(id); // id === serverMid for server-only drafts
      mutate((prev) => prev?.filter((e) => !(e.scope === scope && e.draft.id === id)));
    } finally {
      setDeleting(null);
    }
  }

  async function handleLoad(entry: DraftEntry) {
    await storageSet(channelKey(`pending-draft:${entry.scope}`), entry.draft);
    await props.onLoad(entry);
  }

  return (
    <WidgetShell
      class="flex flex-col"
      icon={<MdOutlineDescription class="w-4 h-4" />}
      title={props.title}
      actions={
        <>
          <Show when={!loading() && entries().length > 0}>
            <span class="text-xs text-muted tabular-nums">{entries().length}</span>
          </Show>
          <IconButton
            label={props.refreshTitle}
            size="sm"
            onClick={() => void loadAll()}
            disabled={data.fetching}
          >
            <MdOutlineRefresh class="w-3.5 h-3.5" classList={{ "animate-spin": data.fetching }} />
          </IconButton>
        </>
      }
    >

      {/* Loading skeletons */}
      <Show when={loading()}>
        <For each={[1, 2]}>{() => <SkeletonRow />}</For>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && entries().length === 0}>
        <div class="px-(--ws-px) py-6 flex flex-col items-center gap-2 text-muted">
          <MdOutlineDescription class="w-8 h-8 opacity-30" />
          <span class="text-xs">{props.emptyText}</span>
        </div>
      </Show>

      {/* Draft list */}
      <Show when={!loading()}>
        <div class="divide-y divide-rim max-h-[26rem] overflow-y-auto">
          <For each={entries()}>
            {(entry) => {
              const isDeleting = () => deleting() === entry.draft.id;
              const canLoad = () => loadable(entry.scope);

              return (
                <div class="px-(--ws-px) py-3 hover:bg-elevated group transition-colors"
                  classList={{ "opacity-50 pointer-events-none": isDeleting() }}>

                  {/* Line 1 + 2 — title & summary */}
                  <div
                    class={canLoad() ? "cursor-pointer" : ""}
                    onClick={() => { if (canLoad()) void handleLoad(entry); }}
                  >
                    <p class="text-sm font-medium text-txt truncate leading-snug">
                      <Show when={entry.draft.title} fallback={<em class="font-normal text-muted">{props.untitledText}</em>}>
                        {entry.draft.title}
                      </Show>
                    </p>
                    <p class="text-xs text-muted truncate mt-0.5">
                      <Show when={entry.draft.preview} fallback={<em>{props.emptyDraftText}</em>}>
                        {entry.draft.preview}
                      </Show>
                    </p>
                  </div>

                  {/* Line 3 — badge · delete · date (right-aligned) */}
                  <div class="flex items-center justify-between mt-1.5">
                    <span class={`shrink-0 text-[0.625rem] font-semibold px-1.5 py-0.5 rounded
                                  border leading-none select-none ${
                                    typeof props.badgeClassName === "function"
                                      ? props.badgeClassName(entry.scope)
                                      : props.badgeClassName}`}>
                      {props.badgeLabel(entry.scope)}
                    </span>
                    <div class="flex items-center gap-2.5">
                      <IconButton
                        label={props.deleteTitle}
                        variant="danger"
                        size="sm"
                        class="-m-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => void deleteDraft(entry.scope, entry.draft.id)}
                      >
                        <Show
                          when={!isDeleting()}
                          fallback={
                            <MdOutlineRefresh class="w-3 h-3 animate-spin" />
                          }
                        >
                          <MdFillDelete size={12} />
                        </Show>
                      </IconButton>
                      <span
                        class="text-[0.625rem] text-muted/60 tabular-nums shrink-0"
                        title={new Date(entry.draft.created).toLocaleString()}
                      >
                        {formatDate(entry.draft.created)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </WidgetShell>
  );
}
