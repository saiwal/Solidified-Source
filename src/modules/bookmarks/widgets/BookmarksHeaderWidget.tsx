import { Show, For, createSignal } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { fetchAllBookmarks, createBookmark, type BookmarkMenu } from "../api";
import { resetChatBookmarks } from "@/modules/chat/bookmarks";
import { Button } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { Card } from "@ui/Card";

export default function BookmarksHeaderWidget() {
  const { t } = useI18n();
  const [menus] = createQueryResource<BookmarkMenu[]>("bookmarks", fetchAllBookmarks, {
    initialValue: [],
  });
  const totalCount = () => (menus() ?? []).reduce((s, m) => s + m.items.length, 0);

  // Core's only way to bookmark an arbitrary URL is the /rbmark form (and the
  // bookmarklet that posts to it). This is that form.
  const [open, setOpen] = createSignal(false);
  const [url, setUrl] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [folder, setFolder] = createSignal(0);
  const [newFolder, setNewFolder] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  async function save() {
    const u = url().trim();
    if (!u) {
      toast.error(t("bookmarks.url_required") as string);
      return;
    }
    setSaving(true);
    try {
      const name = newFolder().trim();
      await createBookmark({
        url: u,
        // Core requires a title; fall back to the URL rather than refusing.
        title: title().trim() || u,
        ...(name ? { menu_name: name } : folder() ? { menu_id: folder() } : {}),
      });
      toast.success(t("bookmarks.added") as string);
      // Both widgets read the same ["bookmarks"] key; chat caches these rows too.
      await queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      resetChatBookmarks();
      setOpen(false);
      setUrl(""); setTitle(""); setNewFolder("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="max-w-5xl mx-auto space-y-3">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold text-txt">{t("bookmarks.title")}</h1>
        <Show when={!menus.loading && totalCount() > 0}>
          <span class="text-xs text-muted tabular-nums">{totalCount()}</span>
        </Show>
        <Button variant="ghost" size="sm" class="ml-auto" onClick={() => setOpen(!open())}>
          {t("bookmarks.add")}
        </Button>
      </div>

      <Show when={open()}>
        <Card class="p-4 space-y-2">
          <div class="text-xs font-medium text-muted">{t("bookmarks.add_title")}</div>
          <Input
            class="w-full"
            type="url"
            placeholder={t("bookmarks.field_url") as string}
            value={url()}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
          <Input
            class="w-full"
            type="text"
            placeholder={t("bookmarks.field_title") as string}
            value={title()}
            onInput={(e) => setTitle(e.currentTarget.value)}
          />
          <div class="flex flex-wrap items-center gap-2">
            <Select
              size="sm"
              class="min-w-0 flex-1"
              value={String(folder())}
              onChange={(e) => setFolder(parseInt(e.currentTarget.value, 10))}
              disabled={!!newFolder().trim()}
            >
              <option value="0">{t("bookmarks.default_folder")}</option>
              <For each={(menus() ?? []).filter((m) => !m.system)}>
                {(m) => <option value={String(m.id)}>{m.label}</option>}
              </For>
            </Select>
            <Input
              size="sm"
              class="min-w-0 flex-1"
              type="text"
              placeholder={t("bookmarks.new_folder") as string}
              value={newFolder()}
              onInput={(e) => setNewFolder(e.currentTarget.value)}
            />
          </div>
          <div class="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={() => void save()} disabled={saving()}>
              {saving() ? t("bookmarks.saving") : t("bookmarks.save")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("bookmarks.cancel")}
            </Button>
          </div>
        </Card>
      </Show>
    </div>
  );
}
