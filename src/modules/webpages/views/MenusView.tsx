// Menu manager (/webpages/:nick/menus) — CRUD for Hubzilla menus and their
// items, the data source of the blocks menu widgets and Comanche webpage
// menus. Owner only. Nesting: an item whose link is "menu:<name>" embeds that
// menu as a submenu wherever the menu is rendered.

import { createEffect, createSignal, For, Show } from "solid-js";
import { useParams, A, useNavigate } from "@solidjs/router";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  fetchMyMenus, fetchRawMenu, createMenu, editMenu, deleteMenu,
  createMenuItem, editMenuItem, deleteMenuItem,
  type MenuSummary, type RawMenuItem, type MenuItemInput,
} from "@utsukta/spa-core/lib/menus";
import AclPicker, { entryKey, aclModeToScope, aclModeFrom, aclEntryKeys, type AclEntry, type AclMode } from "@/shared/editor/components/AclPicker";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import {
  MdFillAdd, MdFillClose, MdFillDelete, MdFillLock, MdOutlineEdit_note, MdOutlineMenu,
} from "solid-icons/md";

const inputClass =
  "w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-sm text-txt";

// ── Menu name/desc form (create + rename) ─────────────────────────────────────

function MenuForm(props: {
  initial?: { name: string; desc: string };
  onSubmit: (name: string, desc: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = createSignal(props.initial?.name ?? "");
  const [desc, setDesc] = createSignal(props.initial?.desc ?? "");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await props.onSubmit(name().trim(), desc().trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="bg-surface border border-rim rounded-xl p-3 space-y-2">
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          type="text" value={name()} maxLength={60} class={inputClass}
          placeholder={t("webpages.menu_name") as string}
          onInput={(e) => setName(e.currentTarget.value)}
        />
        <input
          type="text" value={desc()} maxLength={100} class={inputClass}
          placeholder={t("webpages.menu_desc") as string}
          onInput={(e) => setDesc(e.currentTarget.value)}
        />
      </div>
      <Show when={error()}>
        <p class="text-xs text-red-500">{error()}</p>
      </Show>
      <div class="flex items-center justify-end gap-2">
        <button
          onClick={props.onCancel}
          class="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-txt hover:bg-elevated transition-colors"
        >
          {t("webpages.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={busy() || !name().trim()}
          class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium
                 hover:brightness-110 transition-all disabled:opacity-40"
        >
          {t("webpages.save")}
        </button>
      </div>
    </div>
  );
}

// ── Item add/edit form ────────────────────────────────────────────────────────

function ItemForm(props: {
  initial?: RawMenuItem;
  onSubmit: (item: MenuItemInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = createSignal(props.initial?.label ?? "");
  const [link, setLink] = createSignal(props.initial?.link ?? "");
  const [order, setOrder] = createSignal(props.initial?.order ?? 0);
  const [zid, setZid] = createSignal(props.initial?.zid ?? false);
  const [newwin, setNewwin] = createSignal(props.initial?.newwin ?? false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  // "Only me" is stored as allow_cid = [the owner's own hash], so telling it
  // apart from a one-contact custom ACL needs the viewer's hash.
  const selfHash = useNavViewer();
  const initialMode = aclModeFrom(props.initial ?? {}, selfHash()?.hash);
  const initialKeys = aclEntryKeys(props.initial ?? {}, initialMode);
  const [aclMode, setAclMode] = createSignal<AclMode>(initialMode);
  const [allowEntries, setAllowEntries] = createSignal<Set<string>>(initialKeys.allow);
  const [denyEntries, setDenyEntries] = createSignal<Set<string>>(initialKeys.deny);

  function toggleAclEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    const [setSet, setOther] =
      list === "allow" ? [setAllowEntries, setDenyEntries] : [setDenyEntries, setAllowEntries];
    setSet((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setOther((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function clearAclEntries() {
    setAllowEntries(new Set<string>());
    setDenyEntries(new Set<string>());
  }

  function splitEntries(entries: Set<string>): { cid: string[]; gid: string[] } {
    const cid: string[] = [];
    const gid: string[] = [];
    for (const key of entries) {
      const [type, ...rest] = key.split(":");
      const xid = rest.join(":");
      if (type === "c") cid.push(xid);
      if (type === "g") gid.push(xid);
    }
    return { cid, gid };
  }

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const mode = aclMode();
      const item: MenuItemInput = {
        label: label().trim(),
        link: link().trim(),
        order: order(),
        zid: zid(),
        newwin: newwin(),
        scope: aclModeToScope(mode),
      };
      if (mode === "custom") {
        if (allowEntries().size === 0) {
          throw new Error(t("webpages.acl_custom_requires_allow") as string);
        }
        const allow = splitEntries(allowEntries());
        const deny = splitEntries(denyEntries());
        item.contact_allow = allow.cid;
        item.group_allow = allow.gid;
        item.contact_deny = deny.cid;
        item.group_deny = deny.gid;
      }
      await props.onSubmit(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="bg-elevated/50 border border-rim rounded-lg p-3 space-y-2">
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          type="text" value={label()} maxLength={100} class={inputClass}
          placeholder={t("webpages.item_label") as string}
          onInput={(e) => setLabel(e.currentTarget.value)}
        />
        <input
          type="text" value={link()} maxLength={190} class={inputClass}
          placeholder="https://… / menu:name"
          onInput={(e) => setLink(e.currentTarget.value)}
        />
        <input
          type="number" value={order()} class={`${inputClass} sm:w-20`}
          title={t("webpages.item_order") as string}
          onInput={(e) => setOrder(parseInt(e.currentTarget.value, 10) || 0)}
        />
      </div>
      <div class="flex flex-wrap items-center gap-4 text-xs text-muted">
        <label class="flex items-center gap-1.5">
          <input type="checkbox" checked={zid()} onChange={(e) => setZid(e.currentTarget.checked)} />
          {t("webpages.item_zid")}
        </label>
        <label class="flex items-center gap-1.5">
          <input type="checkbox" checked={newwin()} onChange={(e) => setNewwin(e.currentTarget.checked)} />
          {t("webpages.item_newwin")}
        </label>
        <AclPicker
          mode={aclMode()}
          onModeChange={setAclMode}
          allowEntries={allowEntries()}
          denyEntries={denyEntries()}
          onToggle={toggleAclEntry}
          onClear={clearAclEntries}
        />
      </div>
      <Show when={error()}>
        <p class="text-xs text-red-500">{error()}</p>
      </Show>
      <div class="flex items-center justify-end gap-2">
        <button
          onClick={props.onCancel}
          class="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-txt hover:bg-elevated transition-colors"
        >
          {t("webpages.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={busy() || !label().trim() || !link().trim()}
          class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium
                 hover:brightness-110 transition-all disabled:opacity-40"
        >
          {t("webpages.save")}
        </button>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function MenusView() {
  const { t } = useI18n();
  const params = useParams<{ nick: string }>();
  const auth = useAuth();
  const navigate = useNavigate();

  const nick = () => params.nick || auth()?.nick || "";

  createEffect(() => {
    if ((auth as any).loading || !nick()) return;
    if (auth()?.nick !== nick()) navigate(`/page/${nick()}/home`, { replace: true });
  });

  const [menus] = createQueryResource("my-menus", fetchMyMenus);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [raw] = createQueryResource("menu-raw", () => selectedId(), fetchRawMenu);

  const [creating, setCreating] = createSignal(false);
  const [renamingId, setRenamingId] = createSignal<number | null>(null);
  const [addingItem, setAddingItem] = createSignal(false);
  const [editingItemId, setEditingItemId] = createSignal<number | null>(null);

  const handleDeleteMenu = async (m: MenuSummary) => {
    if (!confirm(`${t("webpages.delete")} "${m.desc || m.name}"?`)) return;
    await deleteMenu(m.id);
    if (selectedId() === m.id) setSelectedId(null);
  };

  const handleDeleteItem = async (it: RawMenuItem) => {
    if (!confirm(`${t("webpages.delete")} "${it.label}"?`)) return;
    await deleteMenuItem(selectedId()!, it.id);
  };

  return (
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
      {/* Header */}
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-lg font-semibold text-txt">{t("webpages.manage_menus")}</h1>
          <A href={`/webpages/${nick()}`} class="text-xs text-muted hover:text-accent transition-colors">
            {t("webpages.back")}
          </A>
        </div>
        <button
          onClick={() => setCreating(!creating())}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent
                 text-accent-fg text-sm hover:opacity-90 transition-opacity shrink-0"
        >
          <MdFillAdd size={16} />
          {t("webpages.new_menu")}
        </button>
      </div>

      <Show when={creating()}>
        <MenuForm
          onCancel={() => setCreating(false)}
          onSubmit={async (name, desc) => {
            const id = await createMenu(name, desc);
            setCreating(false);
            setSelectedId(id);
          }}
        />
      </Show>

      <div class="border-t border-rim" />

      {/* Menu list */}
      <Show
        when={(menus() ?? []).length > 0}
        fallback={
          <Show when={!menus.loading}>
            <div class="py-12 flex flex-col items-center gap-3 text-center">
              <MdOutlineMenu class="w-10 h-10 text-muted" />
              <p class="text-sm text-muted">{t("webpages.no_menus")}</p>
            </div>
          </Show>
        }
      >
        <div class="space-y-0.5">
          <For each={menus() ?? []}>
            {(m) => (
              <Show
                when={renamingId() !== m.id}
                fallback={
                  <MenuForm
                    initial={{ name: m.name, desc: m.desc }}
                    onCancel={() => setRenamingId(null)}
                    onSubmit={async (name, desc) => {
                      await editMenu(m.id, name, desc);
                      setRenamingId(null);
                    }}
                  />
                }
              >
                <div
                  class={`flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-colors cursor-pointer
                          ${selectedId() === m.id ? "bg-elevated" : "hover:bg-elevated"}`}
                  onClick={() => {
                    setSelectedId(selectedId() === m.id ? null : m.id);
                    setAddingItem(false);
                    setEditingItemId(null);
                  }}
                >
                  <MdOutlineMenu class="w-5 h-5 shrink-0 text-muted select-none" />
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium text-txt truncate block">
                      {m.desc || m.name}
                    </span>
                    <span class="text-[0.6875rem] text-muted font-mono truncate block">{m.name}</span>
                  </div>
                  <span class="hidden sm:block text-xs text-muted shrink-0">
                    {m.item_count} {t("webpages.items_label")}
                  </span>
                  <div class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingId(m.id); }}
                      class="p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
                      title={t("webpages.edit") as string}
                    >
                      <MdOutlineEdit_note size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteMenu(m); }}
                      class="p-1.5 rounded text-muted hover:text-red-500 hover:bg-overlay transition-colors"
                      title={t("webpages.delete") as string}
                    >
                      <MdFillDelete size={14} />
                    </button>
                  </div>
                </div>
              </Show>
            )}
          </For>
        </div>
      </Show>

      {/* Item editor for the selected menu */}
      <Show when={selectedId() && raw()}>
        {(_) => (
          <div class="bg-surface border border-rim rounded-xl overflow-hidden">
            <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-rim">
              <h2 class="text-sm font-semibold text-txt truncate">
                {raw()!.menu.desc || raw()!.menu.name}
                <span class="ml-2 text-xs font-normal text-muted font-mono">{raw()!.menu.name}</span>
              </h2>
              <button
                onClick={() => { setAddingItem(!addingItem()); setEditingItemId(null); }}
                class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted
                       hover:text-txt hover:bg-elevated transition-colors shrink-0"
              >
                <Show when={addingItem()} fallback={<MdFillAdd size={12} />}>
                  <MdFillClose size={12} />
                </Show>
                {t("webpages.add_item")}
              </button>
            </div>

            <div class="p-3 space-y-2">
              <Show when={addingItem()}>
                <ItemForm
                  onCancel={() => setAddingItem(false)}
                  onSubmit={async (item) => {
                    await createMenuItem(selectedId()!, item);
                    setAddingItem(false);
                  }}
                />
              </Show>

              <Show
                when={raw()!.items.length > 0}
                fallback={<p class="px-1 py-2 text-xs text-muted">{t("webpages.no_items")}</p>}
              >
                <div class="space-y-0.5">
                  <For each={raw()!.items}>
                    {(it) => (
                      <Show
                        when={editingItemId() !== it.id}
                        fallback={
                          <ItemForm
                            initial={it}
                            onCancel={() => setEditingItemId(null)}
                            onSubmit={async (item) => {
                              await editMenuItem(selectedId()!, it.id, item);
                              setEditingItemId(null);
                            }}
                          />
                        }
                      >
                        <div class="flex items-center gap-3 px-2 py-2 rounded-lg group hover:bg-elevated transition-colors">
                          <span class="w-8 text-right text-[0.6875rem] text-muted font-mono shrink-0">
                            {it.order}
                          </span>
                          <div class="flex-1 min-w-0">
                            <span class="text-sm text-txt truncate block">{it.label}</span>
                            <span class="text-[0.6875rem] text-muted font-mono truncate block">{it.link}</span>
                          </div>
                          <div class="hidden sm:flex items-center gap-1.5 shrink-0 text-[0.625rem] text-muted">
                            <Show when={it.link.toLowerCase().startsWith("menu:")}>
                              <span class="px-1.5 py-0.5 rounded bg-elevated text-accent">
                                {t("webpages.submenu_label")}
                              </span>
                            </Show>
                            <Show when={it.newwin}>
                              <span class="px-1.5 py-0.5 rounded bg-elevated">{t("webpages.item_newwin")}</span>
                            </Show>
                            <Show when={it.zid}>
                              <span class="px-1.5 py-0.5 rounded bg-elevated">zid</span>
                            </Show>
                            <Show when={it.locked}>
                              <MdFillLock size={11} title={t("webpages.item_locked") as string} />
                            </Show>
                          </div>
                          <div class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => { setEditingItemId(it.id); setAddingItem(false); }}
                              class="p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
                              title={t("webpages.edit") as string}
                            >
                              <MdOutlineEdit_note size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(it)}
                              class="p-1.5 rounded text-muted hover:text-red-500 hover:bg-overlay transition-colors"
                              title={t("webpages.delete") as string}
                            >
                              <MdFillDelete size={14} />
                            </button>
                          </div>
                        </div>
                      </Show>
                    )}
                  </For>
                </div>
              </Show>

              <p class="px-1 pt-1 text-[0.6875rem] text-muted">{t("webpages.submenu_hint")}</p>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
