// Cloud bookmarks are ordinary bookmarks (menu_item rows) whose URL is a
// /cloud/ path on this hub — no storage of their own. Reads share the
// bookmarks module's ["bookmarks"] query, so a save here shows up there too.
import { createMemo } from "solid-js";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { isLocalUser } from "@utsukta/spa-core/store/auth-store";
import { fetchAllBookmarks, createBookmark, deleteBookmark } from "@/modules/bookmarks/api";
import { cloudPath, cloudKey } from "./api";

export interface CloudBookmark {
  id: number;
  title: string;
  /** Decoded "/cloud/nick/a/b" — the comparison key, and what to navigate to. */
  path: string;
}

export function useCloudBookmarks() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // Bookmarks are a local-channel feature (/spa/bookmarks requires one); the
  // list also 403s without the Bookmarks app — that just means "none shown".
  const query = useQuery(() => ({
    queryKey: ["bookmarks"],
    queryFn: fetchAllBookmarks,
    enabled: isLocalUser(),
  }));

  const list = createMemo<CloudBookmark[]>(() =>
    (query.data ?? []).flatMap((m) => m.items).flatMap((i) => {
      const path = cloudKey(i.url);
      return path ? [{ id: i.id, title: i.title, path }] : [];
    }),
  );

  const find = (nick: string, displayPath: string) => {
    const key = cloudKey(cloudPath(nick, displayPath));
    return list().find((b) => b.path === key);
  };

  async function toggle(nick: string, displayPath: string, title: string) {
    const existing = find(nick, displayPath);
    try {
      if (existing) await deleteBookmark(existing.id);
      else await createBookmark({ url: location.origin + cloudPath(nick, displayPath), title });
      toast.success(t(existing ? "files_mod.unbookmarked" : "files_mod.bookmarked") as string);
    } catch {
      toast.error(t("files_mod.bookmark_failed") as string);
    }
    await queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
  }

  async function remove(id: number) {
    try {
      await deleteBookmark(id);
    } catch {
      toast.error(t("files_mod.bookmark_failed") as string);
    }
    await queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
  }

  return { enabled: isLocalUser, list, find, toggle, remove };
}
