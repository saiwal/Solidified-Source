/**
 * AclPicker.tsx
 * ACL (Access Control List) picker component shared between PostComposer and other editors.
 * Allows selecting public/connections/custom visibility for posts.
 */

import {
  createSignal,
  createEffect,
  Show,
  For,
  type Component,
  type JSX,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { Portal } from "solid-js/web";
import { fetchConnections } from "@/modules/network/api";
import type { AclEntry } from "@/modules/network/api";
import { useConnectionSearch } from "./useConnectionSearch";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";
import { motion } from "solid-motionone";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlinePublic, MdFillLock, MdOutlineTune, MdFillCheck, MdOutlineGroup, MdOutlinePerson, MdFillPerson } from "solid-icons/md";
void motion;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AclMode = "public" | "connections" | "me" | "custom";
export type { AclEntry };

// Key format: "{type}:{xid}" — e.g. "c:abc123..." or "g:d7ac40c2-..."
export function entryKey(e: AclEntry): string {
  return `${e.type}:${e.xid}`;
}

// "me" is the picker's user-facing wording; every backend ACL resolver
// speaks of it as scope/visibility "private" (allow_cid = the owner's own
// channel hash, resolved server-side since the client doesn't know it).
export function aclModeToScope(mode: AclMode): "public" | "connections" | "private" | "custom" {
  return mode === "me" ? "private" : mode;
}

export interface AclPickerProps {
  mode: AclMode;
  onModeChange: (m: AclMode) => void;
  allowEntries: Set<string>;
  denyEntries: Set<string>;
  onToggle: (entry: AclEntry, list: "allow" | "deny") => void;
  onClear: () => void;
  /** Optional pre-fetched entries — skips internal fetchConnections when provided. */
  entries?: AclEntry[];
  /**
   * Entries the caller already knows about (e.g. a DM recipient picked from
   * a profile popover) that should resolve to a name/photo in the allow/deny
   * chips even though they weren't returned by a fetch or search.
   */
  seedEntries?: AclEntry[];
  /** Show deny buttons per row (default: true). */
  showDeny?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const AclPicker: Component<AclPickerProps> = (props) => {
  const { t } = useI18n();

  // Privacy groups are cheap and few — pre-fetch them in full and filter
  // client-side as the user types.
  const [groupsRes] = createQueryResource(
    "acl-groups",
    () => !props.entries,
    () => fetchConnections({ type: "g", count: 100 }),
  );

  // Contacts can be huge — a small initial page so the picker isn't empty on
  // open, replaced by a debounced server search once the query is long
  // enough, so the full list is never polled.
  const contacts = useConnectionSearch("c", {
    enabled: () => !props.entries,
    initialCount: 10,
    searchCount: 50,
  });
  const query = contacts.query;
  const setQuery = contacts.setQuery;

  const searching = contacts.searching;
  const loading = () =>
    !props.entries && (groupsRes.loading || contacts.loading());

  // Accumulate every entry we've ever seen — fetched, searched, or seeded
  // by the caller — so an already-selected chip keeps its name/photo even
  // after the search box is cleared or changed to a different query.
  const [resolvedCache, setResolvedCache] = createSignal<Map<string, AclEntry>>(new Map());
  createEffect(() => {
    const incoming = [
      ...(props.entries ?? []),
      ...(props.seedEntries ?? []),
      ...(groupsRes() ?? []),
      ...contacts.initial(),
      ...contacts.results(),
    ];
    if (!incoming.length) return;
    setResolvedCache((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const e of incoming) {
        const key = entryKey(e);
        if (!next.has(key)) {
          next.set(key, e);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  });

  const { open, setOpen, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "top-start", offset: 8 });

  const filtered = (): AclEntry[] => {
    const q = query().toLowerCase().trim();
    if (props.entries) {
      if (!q) return props.entries;
      return props.entries.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.nick ?? "").toLowerCase().includes(q) ||
          (c.link ?? "").toLowerCase().includes(q),
      );
    }
    const matchesQuery = (c: AclEntry) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.nick ?? "").toLowerCase().includes(q);
    const groups = (groupsRes() ?? []).filter(matchesQuery);
    if (!searching()) {
      return [...groups, ...contacts.initial().filter(matchesQuery)];
    }
    return [...groups, ...contacts.results()];
  };

  const totalSelected = () => props.allowEntries.size + props.denyEntries.size;

  const modes: { mode: AclMode; icon: () => JSX.Element; label: () => string }[] = [
    { mode: "public",      icon: () => <MdOutlinePublic class="w-3.5 h-3.5" />, label: () => t("editor.acl_public") },
    { mode: "connections", icon: () => <MdFillLock class="w-3.5 h-3.5" />,      label: () => t("editor.acl_connections") },
    { mode: "me",          icon: () => <MdFillPerson class="w-3.5 h-3.5" />,    label: () => t("editor.acl_me") },
    { mode: "custom",      icon: () => <MdOutlineTune class="w-3.5 h-3.5" />,   label: () => `${t("editor.acl_custom")}${totalSelected() > 0 ? ` (${totalSelected()})` : ""}` },
  ];

  const current = () => modes.find((m) => m.mode === props.mode) ?? modes[0];

  return (
    <div class="shrink-0">
      {/* Trigger — shows the active mode */}
      <button
        ref={setTriggerRef}
        type="button"
        onClick={toggle}
        class="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border border-rim
               text-muted hover:border-rim-strong hover:text-txt transition-all"
      >
        {current().icon()} {current().label()}
        <svg
          class={`w-3 h-3 transition-transform ${open() ? "rotate-180" : "rotate-0"}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown — Portal to escape the host modal's stacking context. The
          z has to clear every modal that can contain this picker (the deepest
          today is the Excalidraw save dialog at z-90), or the panel opens
          behind the modal and reads as "the dropdown doesn't open". */}
      <Show when={open()}>
        <Portal>
          <div
            ref={(el) => setPanelRef(el)}
            use:motion={{
              initial: { opacity: 0, scale: 0.97, y: 6 },
              animate: { opacity: 1, scale: 1, y: 0 },
              transition: { duration: 0.15 },
            }}
            style={floatStyle()}
            class={`z-[200] rounded-xl border border-rim bg-surface shadow-xl overflow-hidden
                    flex flex-col max-h-96 ${props.mode === "custom" ? "w-80" : "w-56"}`}
          >
          {/* Mode options */}
          <div class={"py-1 shrink-0" + (props.mode === "custom" ? " border-b border-rim" : "")}>
            <For each={modes}>
              {({ mode: m, icon, label }) => (
                <button
                  type="button"
                  onClick={() => {
                    props.onModeChange(m);
                    if (m !== "custom") setOpen(false);
                  }}
                  class={
                    "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors " +
                    (props.mode === m ? "text-accent bg-accent/10" : "text-txt hover:bg-elevated")
                  }
                >
                  {icon()} {label()}
                  <Show when={props.mode === m}>
                    <MdFillCheck class="w-3.5 h-3.5 ml-auto shrink-0" />
                  </Show>
                </button>
              )}
            </For>
          </div>

          <Show when={props.mode === "custom"}>
          {/* Search */}
          <div class="px-3 py-2 border-b border-rim shrink-0">
            <input
              type="text"
              placeholder={t("editor.acl_search_placeholder")}
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-rim
                     bg-elevated text-txt
                     placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          {/* Selected chips */}
          <Show when={totalSelected() > 0}>
            <div class="flex flex-wrap gap-1 px-3 py-2 border-b border-rim shrink-0 max-h-24 overflow-y-auto">
              <For each={[...props.allowEntries]}>
                {(key) => {
                  const conn = resolvedCache().get(key);
                  return (
                    <span
                      class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                                 bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-600
                                 text-green-700 dark:text-green-300"
                    >
                      <MdFillCheck class="w-3 h-3 shrink-0" /> {conn?.name ?? key.slice(0, 14) + "…"}
                      <button
                        type="button"
                        onClick={() => conn && props.onToggle(conn, "allow")}
                        class="hover:text-green-900 dark:hover:text-green-100 leading-none"
                      >
                        ✕
                      </button>
                    </span>
                  );
                }}
              </For>
              <For each={[...props.denyEntries]}>
                {(key) => {
                  const conn = resolvedCache().get(key);
                  return (
                    <span
                      class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                                 bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-600
                                 text-red-700 dark:text-red-300"
                    >
                      ✕ {conn?.name ?? key.slice(0, 14) + "…"}
                      <button
                        type="button"
                        onClick={() => conn && props.onToggle(conn, "deny")}
                        class="hover:text-red-900 dark:hover:text-red-100 leading-none"
                      >
                        ✕
                      </button>
                    </span>
                  );
                }}
              </For>
              <button
                type="button"
                onClick={props.onClear}
                class="px-2 py-0.5 rounded-full text-xs text-muted hover:text-red-500 transition-colors border border-rim"
              >
                {t("editor.acl_clear_all")}
              </button>
            </div>
          </Show>

          {/* Legend */}
          <div class="flex items-center gap-4 px-3 py-1.5 border-b border-rim shrink-0">
            <span class="text-[0.625rem] text-muted">
              {t("editor.acl_legend")}
            </span>
            <span class="flex items-center gap-1 text-[0.625rem] text-green-600 dark:text-green-400 ml-auto">
              <span class="w-2 h-2 rounded-full bg-green-400 inline-block" />{" "}
              {t("editor.acl_allowed")}
            </span>
            <span class="flex items-center gap-1 text-[0.625rem] text-red-500 dark:text-red-400">
              <span class="w-2 h-2 rounded-full bg-red-400 inline-block" />{" "}
              {t("editor.acl_denied")}
            </span>
          </div>

          {/* List */}
          <ul class="overflow-y-auto flex-1 py-1">
            <Show when={loading()}>
              <li class="px-4 py-3 text-xs text-muted text-center">
                {t("editor.acl_loading")}
              </li>
            </Show>
            <For each={filtered()}>
              {(c) => {
                const key = entryKey(c);
                const isAllowed = () => props.allowEntries.has(key);
                const isDenied = () => props.denyEntries.has(key);
                return (
                  <li class="flex items-center gap-1 pr-2">
                    {/* Main row — click = toggle allow */}
                    <button
                      type="button"
                      onClick={() => props.onToggle(c, "allow")}
                      class={
                        "flex-1 flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors min-w-0 " +
                        (isAllowed()
                          ? "bg-green-50 dark:bg-green-500/10"
                          : isDenied()
                            ? "bg-red-50 dark:bg-red-500/10"
                            : "hover:bg-elevated")
                      }
                    >
                      {/* Avatar */}
                      <Show
                        when={c.photo}
                        fallback={
                          <span class="w-6 h-6 rounded-full shrink-0 bg-elevated flex items-center justify-center text-muted">
                            {c.type === "g"
                              ? <MdOutlineGroup class="w-4 h-4" />
                              : <MdOutlinePerson class="w-4 h-4" />}
                          </span>
                        }
                      >
                        <img
                          src={c.photo}
                          alt=""
                          class="w-6 h-6 rounded-full shrink-0 object-cover bg-elevated"
                        />
                      </Show>

                      <span class="flex flex-col min-w-0 flex-1">
                        <span class="truncate text-xs font-medium text-txt">
                          {c.name}
                        </span>
                        <Show when={c.link}>
                          <span class="truncate text-[0.625rem] text-muted">
                            {c.link}
                          </span>
                        </Show>
                      </span>

                      <Show when={isAllowed()}>
                        <MdFillCheck class="text-green-500 w-3.5 h-3.5 shrink-0" />
                      </Show>
                    </button>

                    {/* Deny button — hidden when showDeny=false */}
                    <Show when={props.showDeny !== false}>
                      <button
                        type="button"
                        title={t("editor.acl_deny_title")}
                        onClick={() => props.onToggle(c, "deny")}
                        class={
                          "shrink-0 w-6 h-6 rounded flex items-center justify-center text-xs transition-colors " +
                          (isDenied()
                            ? "bg-red-100 dark:bg-red-500/20 text-red-500 dark:text-red-400"
                            : "text-muted/50 hover:bg-red-500/10 hover:text-red-400")
                        }
                      >
                        ✕
                      </button>
                    </Show>
                  </li>
                );
              }}
            </For>
          </ul>
          </Show>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default AclPicker;
