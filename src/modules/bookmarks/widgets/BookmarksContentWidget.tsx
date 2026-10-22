import { For, Show, createSignal, createMemo } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import {
  fetchAllBookmarks,
  deleteBookmark,
  updateBookmark,
  saveFolder,
  deleteFolder,
  reorderBookmarks,
  type BookmarkMenu,
  type BookmarkItem,
} from "../api";
import { resetChatBookmarks } from "@/modules/chat/bookmarks";
import { MdOutlineBookmark_border, MdOutlineDelete, MdOutlineExpand_less, MdOutlineExpand_more } from "solid-icons/md";
import { Button, IconButton } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { Card, CardHeader } from "@ui/Card";
import { Badge } from "@ui/Badge";

export default function BookmarksContentWidget() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [menus, { mutate, refetch }] = createQueryResource<BookmarkMenu[]>(
    "bookmarks", fetchAllBookmarks, { initialValue: [] });

  // Core renders these as two sections: your own folders, and the ones
  // bookmark_add() created from other people's posts (MENU_SYSTEM|MENU_BOOKMARK).
  const own = createMemo(() => (menus() ?? []).filter((m) => !m.system));
  const connections = createMemo(() => (menus() ?? []).filter((m) => m.system));
  const totalCount = () => (menus() ?? []).reduce((s, m) => s + m.items.length, 0);

  const [editing, setEditing] = createSignal<number | null>(null);
  const [editTitle, setEditTitle] = createSignal("");
  const [editUrl, setEditUrl] = createSignal("");
  const [editFolder, setEditFolder] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  const [renaming, setRenaming] = createSignal<number | null>(null);
  const [renameValue, setRenameValue] = createSignal("");
  const [confirmFolder, setConfirmFolder] = createSignal<number | null>(null);

  async function run(fn: () => Promise<unknown>) {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
      await refetch();
      // Chat keeps its own signal cache of the same rows.
      resetChatBookmarks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: BookmarkItem) {
    // Optimistic: the row is gone either way, and a failed delete is re-read by run().
    mutate((prev) =>
      (prev ?? [])
        .map((menu) => ({ ...menu, items: menu.items.filter((i) => i.id !== item.id) }))
        .filter((menu) => menu.items.length > 0));
    await run(() => deleteBookmark(item.id));
  }

  function startEdit(item: BookmarkItem, menu: BookmarkMenu) {
    setEditing(item.id);
    setEditTitle(item.title);
    setEditUrl(item.url);
    setEditFolder(menu.id);
  }

  async function saveEdit(item: BookmarkItem) {
    const title = editTitle().trim();
    const url = editUrl().trim();
    if (!url || !title) {
      toast.error(t("bookmarks.url_required") as string);
      return;
    }
    await run(() => updateBookmark(item.id, { title, url, menu_id: editFolder() }));
    setEditing(null);
  }

  async function renameFolder(menu: BookmarkMenu) {
    const name = renameValue().trim();
    if (!name) return;
    await run(async () => {
      await saveFolder({ menu_id: menu.id, name, desc: name });
      toast.success(t("bookmarks.folder_saved") as string);
    });
    setRenaming(null);
  }

  /** Swap one item with its neighbour and persist the whole folder's order. */
  async function nudge(menu: BookmarkMenu, index: number, delta: number) {
    const ids = menu.items.map((i) => i.id);
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    await run(() => reorderBookmarks(menu.id, ids));
  }

  function visit(item: BookmarkItem) {
    // visit_url carries magic auth for links to known zot hubs (MENU_ITEM_ZID) —
    // following the raw link instead would land you there logged out.
    const url = item.visit_url || item.url;
    try {
      const u = new URL(url);
      if (u.origin === window.location.origin) {
        navigate(u.pathname + u.search);
        return;
      }
    } catch { /* fall through */ }
    window.open(url, "_blank", "noopener");
  }

  const folderOptions = () => own().map((m) => ({ id: m.id, label: m.label }));

  return (
    <div class="max-w-3xl mx-auto space-y-6">

      <Show when={menus.loading && totalCount() === 0}>
        <div class="space-y-4">
          <For each={[1, 2]}>{() => (
            <div class="bg-surface border border-rim rounded-2xl overflow-hidden animate-pulse">
              <CardHeader>
                <div class="h-3.5 bg-elevated rounded w-32" />
              </CardHeader>
              <div class="divide-y divide-rim">
                <For each={[1, 2, 3]}>{() => (
                  <div class="px-4 py-3 flex items-center gap-3">
                    <div class="h-3 bg-elevated rounded flex-1" />
                    <div class="h-3 bg-elevated rounded w-16" />
                  </div>
                )}</For>
              </div>
            </div>
          )}</For>
        </div>
      </Show>

      <Show when={!menus.loading && totalCount() === 0}>
        <div class="flex flex-col items-center gap-3 py-16 text-muted">
          <MdOutlineBookmark_border class="w-10 h-10 opacity-30" />
          <p class="text-sm font-medium">{t("bookmarks.no_bookmarks")}</p>
          <p class="text-xs text-center max-w-xs">{t("bookmarks.no_bookmarks_desc")}</p>
        </div>
      </Show>

      <For each={[
        { key: "own" as const, label: t("bookmarks.section_own"), menus: own() },
        { key: "conn" as const, label: t("bookmarks.section_connections"), menus: connections() },
      ]}>
        {(section) => (
          <Show when={section.menus.length > 0}>
            <section class="space-y-4">
              {/* Only worth a heading once there is more than one section in play. */}
              <Show when={own().length > 0 && connections().length > 0}>
                <h2 class="text-xs font-semibold uppercase tracking-wide text-muted px-1">
                  {section.label}
                </h2>
              </Show>

              <For each={section.menus}>
                {(menu) => (
                  <Card raised class="overflow-hidden">
                    <CardHeader class="flex items-center gap-2">
                      <svg class="w-3.5 h-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                      </svg>

                      <Show
                        when={renaming() === menu.id}
                        fallback={
                          <span class="text-xs font-semibold text-txt truncate">
                            {menu.label || t("bookmarks.untitled_folder")}
                          </span>
                        }
                      >
                        <Input size="sm" class="min-w-0 flex-1" type="text" value={renameValue()} onInput={(e) => setRenameValue(e.currentTarget.value)} onKeyDown={(e) => {
                            if (e.key === "Enter") void renameFolder(menu);
                            if (e.key === "Escape") setRenaming(null);
                          }} />
                        <Button size="sm" onClick={() => void renameFolder(menu)} disabled={busy()}>
                          {t("bookmarks.save")}
                        </Button>
                      </Show>

                      <span class="ml-auto text-xs text-muted tabular-nums">{menu.items.length}</span>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setRenaming(menu.id); setRenameValue(menu.label); }}
                        title={t("bookmarks.rename_folder") as string}
                      >
                        {t("bookmarks.rename_folder")}
                      </Button>
                      <button
                        onClick={() => {
                          if (confirmFolder() === menu.id) {
                            void run(() => deleteFolder(menu.id));
                            setConfirmFolder(null);
                          } else {
                            setConfirmFolder(menu.id);
                          }
                        }}
                        class={`text-[0.625rem] px-2 py-0.5 rounded border transition-colors
                                ${confirmFolder() === menu.id
                                  ? "border-danger text-danger-txt"
                                  : "border-rim text-muted hover:text-danger-txt"}`}
                        title={t("bookmarks.delete_folder") as string}
                      >
                        {confirmFolder() === menu.id
                          ? t("bookmarks.delete_folder_confirm")
                          : t("bookmarks.delete_folder")}
                      </button>
                    </CardHeader>

                    <div class="divide-y divide-rim">
                      <For each={menu.items}>
                        {(item, index) => (
                          <div class="px-4 py-3 hover:bg-elevated group transition-colors">
                            <Show
                              when={editing() === item.id}
                              fallback={
                                <div class="flex items-center gap-3">
                                  <Show when={item.is_chat}>
                                    <Badge tone="accent" size="sm" class="shrink-0">
                                      {t("bookmarks.chat_badge")}
                                    </Badge>
                                  </Show>
                                  <Show when={item.private}>
                                    <Badge size="sm" class="shrink-0">
                                      {t("bookmarks.private_badge")}
                                    </Badge>
                                  </Show>

                                  <button
                                    class="flex-1 min-w-0 text-left hover:text-accent transition-colors"
                                    onClick={() => visit(item)}
                                  >
                                    <span class="block text-sm text-txt truncate">{item.title}</span>
                                    <span class="block text-[0.6875rem] text-subtle truncate">{item.url}</span>
                                  </button>

                                  <div class="flex items-center gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <IconButton
                                      label={t("bookmarks.move_up") as string}
                                      size="sm"
                                      onClick={() => void nudge(menu, index(), -1)}
                                      disabled={busy() || index() === 0}
                                    >
                                      <MdOutlineExpand_less class="w-3 h-3" />
                                    </IconButton>
                                    <IconButton
                                      label={t("bookmarks.move_down") as string}
                                      size="sm"
                                      onClick={() => void nudge(menu, index(), 1)}
                                      disabled={busy() || index() === menu.items.length - 1}
                                    >
                                      <MdOutlineExpand_more class="w-3 h-3" />
                                    </IconButton>
                                    <Button variant="ghost" size="sm" onClick={() => visit(item)}>
                                      {t("bookmarks.visit")}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => startEdit(item, menu)}>
                                      {t("bookmarks.edit")}
                                    </Button>
                                    <IconButton
                                      label={t("bookmarks.remove") as string}
                                      variant="danger"
                                      size="sm"
                                      onClick={() => void remove(item)}
                                    >
                                      <MdOutlineDelete class="w-3.5 h-3.5" />
                                    </IconButton>
                                  </div>
                                </div>
                              }
                            >
                              <div class="space-y-2">
                                <Input
                                  class="w-full"
                                  type="text"
                                  placeholder={t("bookmarks.field_title") as string}
                                  value={editTitle()}
                                  onInput={(e) => setEditTitle(e.currentTarget.value)}
                                />
                                <Input
                                  size="sm"
                                  class="w-full"
                                  type="url"
                                  placeholder={t("bookmarks.field_url") as string}
                                  value={editUrl()}
                                  onInput={(e) => setEditUrl(e.currentTarget.value)}
                                />
                                <div class="flex flex-wrap items-center gap-2">
                                  <Select
                                    size="sm"
                                    class="min-w-0 flex-1"
                                    value={String(editFolder())}
                                    onChange={(e) => setEditFolder(parseInt(e.currentTarget.value, 10))}
                                  >
                                    {/* A connections' folder is a valid destination too — it is
                                        still your own menu, just one the server named. */}
                                    <For each={[...folderOptions(), ...connections().map((m) => ({ id: m.id, label: m.label }))]}>
                                      {(f) => <option value={String(f.id)}>{f.label}</option>}
                                    </For>
                                  </Select>
                                  <Button size="sm" onClick={() => void saveEdit(item)} disabled={busy()}>
                                    {busy() ? t("bookmarks.saving") : t("bookmarks.save")}
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                                    {t("bookmarks.cancel")}
                                  </Button>
                                </div>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Card>
                )}
              </For>
            </section>
          </Show>
        )}
      </For>
    </div>
  );
}
