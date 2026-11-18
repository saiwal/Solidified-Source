/**
 * EmojiPicker.tsx
 * Emoji picker laid out like Discord's: a category rail on the left (recent,
 * then one entry per server emoji pack, then the Unicode groups), one
 * continuous scroll of sections on the right, a name preview underneath.
 *
 * /smilies has no categories, so the Unicode groups come from
 * GET /spa/emoji-groups (the emoji addon's emoji.json, slug → group). An
 * entry with no group whose image isn't from a standard set is a server
 * emoji, grouped into packs by its image folder (images/emoji/custom/kitties).
 */

import { createSignal, createMemo, For, Show, type JSX } from "solid-js";
import {
  MdOutlineEmoji_emotions, MdOutlineEmoji_people, MdOutlineEmoji_nature,
  MdOutlineEmoji_food_beverage, MdOutlineEmoji_transportation, MdOutlineEmoji_events,
  MdOutlineEmoji_objects, MdOutlineEmoji_symbols, MdOutlineFlag, MdOutlineHistory,
  MdOutlineMore_horiz,
} from "solid-icons/md";
import { getEmojiMap, recentEmoji, addRecentEmoji, type EmojiEntry } from "@utsukta/spa-core/store/emoji-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { Input } from "@ui/Field";
import { iconButtonClass } from "@ui/Button";
import { Spinner } from "@ui/Spinner";

export interface EmojiPickerProps {
  onSelect: (entry: EmojiEntry) => void;
  /** Override the trigger button's icon/label (defaults to a solid-icons smiley). */
  triggerIcon?: any;
  /** Override the trigger button's classes (defaults to the EditorToolbar Btn style). */
  triggerClass?: string;
}

// Unicode groups in emoji.json's spelling, in display order.
const GROUPS = [
  ["Smileys & Emotion", "smileys",    MdOutlineEmoji_emotions],
  ["People & Body",     "people",     MdOutlineEmoji_people],
  ["Animals & Nature",  "nature",     MdOutlineEmoji_nature],
  ["Food & Drink",      "food",       MdOutlineEmoji_food_beverage],
  ["Travel & Places",   "travel",     MdOutlineEmoji_transportation],
  ["Activities",        "activities", MdOutlineEmoji_events],
  ["Objects",           "objects",    MdOutlineEmoji_objects],
  ["Symbols",           "symbols",    MdOutlineEmoji_symbols],
  ["Flags",             "flags",      MdOutlineFlag],
] as const;

type GroupId = (typeof GROUPS)[number][1] | "recent" | "other";

/** Images from a standard (Unicode) set — everything else is the hub's own. */
const isStandard = (e: EmojiEntry) =>
  e.filepath.startsWith("addon/emoji/") || e.filepath.startsWith("images/emoji/emojitwo/");

// Fetched once per page load, on first open — not with the editor, which
// mounts the picker's trigger on every composer.
const [groups, setGroups] = createSignal<Record<string, string>>();
let groupsRequested = false;
function loadGroups() {
  if (groupsRequested) return;
  groupsRequested = true;
  fetch("/spa/emoji-groups", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { data: {} }))
    .then((j) => setGroups(j.data ?? {}))
    .catch(() => setGroups({}));
}

interface Section {
  id: string;
  label: string;
  /** Rail icon: an icon component, or (server packs) an emoji image path. */
  icon: ((p: { class?: string }) => JSX.Element) | string;
  items: EmojiEntry[];
  server?: boolean;
}

export default function EmojiPicker(props: EmojiPickerProps) {
  const { t } = useI18n();
  const [query, setQuery] = createSignal("");
  const [hovered, setHovered] = createSignal<EmojiEntry | null>(null);
  const [active, setActive] = createSignal("");
  let scroller: HTMLDivElement | undefined;

  // Prefers opening above the trigger — the toolbar sits at the bottom of the
  // editor, so downward pushes the panel past the modal/page edge. flip()
  // drops it below only when there is genuinely no room above.
  const { open, setOpen, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start", offset: 4 });

  const entries = createMemo(() => Object.entries(getEmojiMap()));

  const recent = createMemo<EmojiEntry[]>(() => {
    const byShort = new Map(entries().map(([, e]) => [e.shortname, e]));
    return recentEmoji().map((s) => byShort.get(s)).filter((e): e is EmojiEntry => !!e);
  });

  const sections = createMemo<Section[]>(() => {
    const g = groups() ?? {};
    const packs = new Map<string, EmojiEntry[]>();
    const standard = new Map<GroupId, EmojiEntry[]>();
    for (const [key, e] of entries()) {
      const group = GROUPS.find(([name]) => name === g[key])?.[1];
      if (group || isStandard(e)) {
        const id: GroupId = group ?? "other";
        if (!standard.has(id)) standard.set(id, []);
        standard.get(id)!.push(e);
      } else {
        const pack = e.filepath.split("/").slice(-2, -1)[0] || "custom";
        if (!packs.has(pack)) packs.set(pack, []);
        packs.get(pack)!.push(e);
      }
    }

    const out: Section[] = [];
    if (recent().length)
      out.push({ id: "recent", label: t("editor.emoji_recent"), icon: MdOutlineHistory, items: recent() });
    for (const [pack, items] of packs)
      out.push({
        id: `pack:${pack}`,
        label: pack.charAt(0).toUpperCase() + pack.slice(1),
        icon: `/${items[0].filepath}`,
        items,
        server: true,
      });
    // Until groups arrive every standard emoji would land in "Other" — hold
    // them back (spinner) rather than reshuffle the grid under the pointer.
    if (groups()) {
      for (const [, id, icon] of GROUPS) {
        const items = standard.get(id);
        if (items) out.push({ id, label: t(`editor.emoji_group_${id}`), icon, items });
      }
      const other = standard.get("other");
      if (other) out.push({ id: "other", label: t("editor.emoji_group_other"), icon: MdOutlineMore_horiz, items: other });
    }
    return out;
  });

  const filtered = createMemo<EmojiEntry[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return [];
    return entries().map(([, e]) => e).filter((e) => e.shortname.toLowerCase().includes(q));
  });

  // Scroll spy: the active rail entry is the last section whose top has
  // scrolled past. The scroller is `relative`, so offsetTop is relative to it.
  function onScroll() {
    if (!scroller) return;
    let cur = sections()[0]?.id ?? "";
    for (const el of scroller.querySelectorAll<HTMLElement>("[data-section]")) {
      if (el.offsetTop <= scroller.scrollTop + 8) cur = el.dataset.section!;
    }
    setActive(cur);
  }

  function jump(id: string) {
    setQuery("");
    // Wait a frame so the sections exist again if a search was showing.
    requestAnimationFrame(() => {
      const el = scroller?.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
      if (scroller && el) scroller.scrollTop = el.offsetTop;
      setActive(id);
    });
  }

  function pick(entry: EmojiEntry) {
    addRecentEmoji(entry.shortname);
    props.onSelect(entry);
    setOpen(false);
    setQuery("");
    setHovered(null);
  }

  function onToggle() {
    loadGroups();
    setActive(sections()[0]?.id ?? "");
    toggle();
  }

  const triggerClass = () =>
    props.triggerClass ??
    `${iconButtonClass("default", "sm")} ${open() ? "bg-elevated text-txt" : ""}`;

  const Grid = (p: { items: EmojiEntry[] }) => (
    <div class="grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-0.5">
      <For each={p.items}>
        {(entry) => (
          <button
            type="button"
            title={entry.shortname}
            aria-label={entry.shortname}
            onClick={() => pick(entry)}
            onMouseEnter={() => setHovered(entry)}
            onFocus={() => setHovered(entry)}
            class="h-9 flex items-center justify-center rounded-lg hover:bg-elevated focus-visible:bg-elevated transition-colors"
          >
            <img src={`/${entry.filepath}`} alt="" loading="lazy" class="w-6 h-6 object-contain" />
          </button>
        )}
      </For>
    </div>
  );

  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        title={t("editor.emoji_picker_title")}
        aria-label={t("editor.emoji_picker_title")}
        aria-expanded={open()}
        onClick={onToggle}
        class={triggerClass()}
      >
        {props.triggerIcon ?? <MdOutlineEmoji_emotions class="w-4 h-4" />}
      </button>

      <Show when={open()}>
        <div
          ref={setPanelRef}
          class="z-50 w-[22rem] max-w-[calc(100vw-1rem)] bg-surface border border-rim rounded-xl shadow-xl overflow-hidden flex flex-col"
          style={floatStyle()}
        >
          <div class="p-2 border-b border-rim">
            <Input
              size="sm"
              class="w-full"
              autofocus
              type="search"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                const first = filtered()[0];
                if (e.key === "Enter" && first) { e.preventDefault(); pick(first); }
              }}
              placeholder={t("editor.emoji_search_placeholder")}
            />
          </div>

          <div class="flex h-72 min-h-0">
            {/* Category rail */}
            <nav
              aria-label={t("editor.emoji_categories")}
              class="w-11 shrink-0 border-r border-rim overflow-y-auto overscroll-contain flex flex-col items-center gap-0.5 py-1"
            >
              <For each={sections()}>
                {(s, i) => (
                  <>
                    {/* Divider between recent / server packs / standard groups */}
                    <Show when={i() > 0 && (sections()[i() - 1].server !== s.server || sections()[i() - 1].id === "recent")}>
                      <hr class="w-6 border-rim my-1" />
                    </Show>
                    <button
                      type="button"
                      title={s.label}
                      aria-label={s.label}
                      aria-current={!query() && active() === s.id ? "true" : undefined}
                      onClick={() => jump(s.id)}
                      class={`${iconButtonClass("default", "sm")} ${!query() && active() === s.id ? "bg-elevated text-accent-txt" : ""}`}
                    >
                      {typeof s.icon === "string"
                        ? <img src={s.icon} alt="" class="w-5 h-5 object-contain" />
                        : <s.icon class="w-5 h-5" />}
                    </button>
                  </>
                )}
              </For>
            </nav>

            {/* Sections */}
            <div
              ref={scroller}
              onScroll={onScroll}
              class="relative flex-1 min-w-0 px-2 pb-2 overflow-y-auto overscroll-contain"
            >
              <Show
                when={!query().trim()}
                fallback={
                  <Show
                    when={filtered().length}
                    fallback={<p class="text-xs text-muted text-center py-6">{t("editor.emoji_no_results")}</p>}
                  >
                    <div class="pt-2"><Grid items={filtered()} /></div>
                  </Show>
                }
              >
                <For each={sections()}>
                  {(s) => (
                    <section data-section={s.id}>
                      <h3 class="sticky top-0 z-10 bg-surface px-1 pt-2 pb-1 text-xs font-medium text-muted flex items-center gap-1.5">
                        {s.label}
                        <Show when={s.server}>
                          <span class="text-[10px] uppercase tracking-wide text-muted/80">· {t("editor.emoji_server")}</span>
                        </Show>
                      </h3>
                      <Grid items={s.items} />
                    </section>
                  )}
                </For>
                <Show when={!groups()}>
                  <div class="flex justify-center py-4"><Spinner /></div>
                </Show>
              </Show>
            </div>
          </div>

          {/* Preview: names the emoji under the pointer/focus — the only way
              to read a shortname on touch, where title tooltips never show. */}
          <div class="h-11 px-3 border-t border-rim flex items-center gap-2 text-sm min-w-0">
            <Show when={hovered()} fallback={<span class="text-xs text-muted">{t("editor.emoji_picker_title")}</span>}>
              {(e) => (
                <>
                  <img src={`/${e().filepath}`} alt="" class="w-7 h-7 object-contain shrink-0" />
                  <span class="font-mono text-xs truncate">{e().shortname}</span>
                </>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
}
