import { createSignal, createEffect, createMemo, onCleanup, For, Show } from "solid-js";
import { MdFillFolder, MdOutlineSearch, MdOutlineClose } from "solid-icons/md";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { listFolderMeta, searchFiles, pruneTree, type PNode, type FileMeta, type FolderFrame } from "../api";
import FileIcon from "./FileIcon";

// Desktop-only folder sidebar. Children load on expand, under the same
// "files-folder" query key as the main listing — so a refetch there (new
// folder, rename, delete) updates the tree too, and expanding a node
// pre-warms the listing you are about to open.

interface Props {
  nick: string;
  /** Current stack, root frame first — drives highlight + auto-expand. */
  stack: FolderFrame[];
  /** Frames from root's child down to the picked folder ([] = root). */
  onSelect: (frames: FolderFrame[]) => void;
  /** A search-result folder was clicked (only its path is known). */
  onOpenPath: (displayPath: string) => void;
  /** A file was clicked — the caller opens its folder and previews it. */
  onOpenFile: (file: FileMeta) => void;
}

export default function FolderTree(props: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set([""]));
  const currentPath = () => props.stack[props.stack.length - 1].displayPath;

  // Keep the path to the open folder expanded, however it was reached.
  createEffect(() => {
    const paths = props.stack.map((f) => f.displayPath);
    setExpanded((prev) => new Set([...prev, ...paths]));
  });

  // Search box: whole-cloud name search; matches render as a pruned tree.
  const [query, setQuery] = createSignal("");
  const [term, setTerm] = createSignal("");
  createEffect(() => {
    const v = query().trim();
    if (!v) { setTerm(""); return; }
    const id = setTimeout(() => setTerm(v), 250);
    onCleanup(() => clearTimeout(id));
  });
  const searching = () => term().length >= 2;
  const [hits] = createQueryResource(
    "files-search",
    () => searching() && { nick: props.nick, q: term() },
    ({ nick, q }) => searchFiles(nick, q, ""),
  );
  const results = createMemo(() => pruneTree(hits() ?? []));

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const rowPad = (depth: number) => ({ "padding-left": `${depth * 14 + 4}px` });

  function Node(p: { frame: FolderFrame; ancestors: FolderFrame[]; depth: number }) {
    const isRoot = p.depth === 0;
    const path = p.frame.displayPath;
    const open = () => expanded().has(path);
    const chain = () => (isRoot ? [] : [...p.ancestors, p.frame]);

    const [listing] = createQueryResource(
      "files-folder",
      () => open() && { nick: props.nick, hash: p.frame.hash },
      ({ nick, hash }) => listFolderMeta(nick, hash),
    );
    // Folders first, then files — both by name.
    const children = createMemo(() =>
      (listing()?.items ?? []).slice().sort((a, b) =>
        a.is_dir !== b.is_dir ? (a.is_dir ? -1 : 1) : a.filename.localeCompare(b.filename)),
    );
    // Unknown until first expand; afterwards hide the toggle on empty folders.
    const leaf = () => open() && !!listing() && children().length === 0;

    return (
      <li role="treeitem" aria-expanded={leaf() ? undefined : open()}>
        <div
          class={`flex items-center gap-1 rounded-md pr-2 py-1 text-sm cursor-pointer select-none
                  ${path === currentPath() ? "bg-accent/15 text-accent font-medium" : "text-txt hover:bg-overlay"}`}
          style={rowPad(p.depth)}
          onClick={() => props.onSelect(chain())}
        >
          <button
            type="button"
            class={`w-4 h-4 shrink-0 flex items-center justify-center text-muted hover:text-txt font-mono ${leaf() ? "invisible" : ""}`}
            aria-label={p.frame.label}
            onClick={(e) => { e.stopPropagation(); toggle(path); }}
          >
            {open() ? "−" : "+"}
          </button>
          <MdFillFolder class="w-4 h-4 shrink-0 text-accent" />
          <span class="truncate">{p.frame.label}</span>
        </div>
        <Show when={open() && children().length}>
          <ul role="group">
            <For each={children()}>
              {(f) => f.is_dir
                ? <Node
                    frame={{ hash: f.hash, displayPath: f.display_path, label: f.filename }}
                    ancestors={chain()}
                    depth={p.depth + 1}
                  />
                : <li role="treeitem">
                    <div
                      class="flex items-center gap-1 rounded-md pr-2 py-1 text-sm text-muted
                             hover:bg-overlay hover:text-txt cursor-pointer select-none"
                      style={rowPad(p.depth + 1)}
                      onClick={() => props.onOpenFile(f)}
                    >
                      <span class="w-4 shrink-0" />
                      <FileIcon item={f} class="w-4 h-4 shrink-0" />
                      <span class="truncate">{f.filename}</span>
                    </div>
                  </li>}
            </For>
          </ul>
        </Show>
      </li>
    );
  }

  // Search results: everything shown expanded, folders navigate by path.
  function HitNode(p: { node: PNode; depth: number }) {
    return (
      <li role="treeitem">
        <div
          class={`flex items-center gap-1 rounded-md pr-2 py-1 text-sm cursor-pointer select-none
                  ${p.node.file && !p.node.file.is_dir
                    ? "text-muted hover:bg-overlay hover:text-txt"
                    : p.node.path === currentPath() ? "bg-accent/15 text-accent font-medium" : "text-txt hover:bg-overlay"}`}
          style={rowPad(p.depth)}
          onClick={() => p.node.file && !p.node.file.is_dir
            ? props.onOpenFile(p.node.file)
            : props.onOpenPath(p.node.path)}
        >
          <Show when={p.node.file && !p.node.file.is_dir} fallback={<MdFillFolder class="w-4 h-4 shrink-0 text-accent" />}>
            <FileIcon item={p.node.file!} class="w-4 h-4 shrink-0" />
          </Show>
          <span class={`truncate ${p.node.file ? "font-medium" : ""}`}>{p.node.name}</span>
        </div>
        <Show when={p.node.children.length}>
          <ul role="group">
            <For each={p.node.children}>{(c) => <HitNode node={c} depth={p.depth + 1} />}</For>
          </ul>
        </Show>
      </li>
    );
  }

  return (
    <nav aria-label={t("files_mod.folder_tree")} class="space-y-3">
      <label class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rim bg-surface
                    text-sm focus-within:border-accent transition-colors">
        <MdOutlineSearch size={16} class="text-muted shrink-0" />
        <input
          type="text"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={t("files_mod.search_files") as string}
          aria-label={t("files_mod.search_files") as string}
          class="flex-1 min-w-0 bg-transparent text-txt placeholder:text-muted focus:outline-none"
        />
        <Show when={query()}>
          <button
            type="button"
            onClick={() => setQuery("")}
            title={t("files_mod.clear_filter") as string}
            aria-label={t("files_mod.clear_filter") as string}
            class="p-0.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors shrink-0"
          >
            <MdOutlineClose size={14} />
          </button>
        </Show>
      </label>

      <Show
        when={searching()}
        fallback={
          <ul role="tree">
            <Node frame={props.stack[0]} ancestors={[]} depth={0} />
          </ul>
        }
      >
        <Show
          when={results().length || hits.loading}
          fallback={<p class="px-2 text-sm text-muted">{t("files_mod.no_matches")}</p>}
        >
          <ul role="tree" class={hits.loading ? "opacity-60" : ""}>
            <For each={results()}>{(n) => <HitNode node={n} depth={0} />}</For>
          </ul>
        </Show>
      </Show>
    </nav>
  );
}
