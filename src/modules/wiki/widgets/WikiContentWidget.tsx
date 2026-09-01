import { createEffect, Show, For, createSignal, createMemo } from "solid-js";
import { A } from "@solidjs/router";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { wikis, wikisLoading, isOwner, wikisError, loadWikis, resetWikis, patchWiki } from "../store";
import { deleteWiki, fetchWikiAcl, saveWikiAcl } from "../api";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import AclPicker, { entryKey, aclModeFrom, aclEntryKeys, type AclMode, type AclEntry } from "@/shared/editor/components/AclPicker";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { MdFillLock, MdFillLock_open, MdFillDelete } from "solid-icons/md";
import { useIsWikiList } from "../lib/isWikiList";

type SortField = "name" | "format";
type SortDir   = "asc"  | "desc";

function mimeLabel(mime: string, t: (k: string) => string): string {
  if (mime === "text/markdown") return t("wiki.format_markdown") as string;
  if (mime === "text/bbcode")   return t("wiki.format_bbcode")   as string;
  return t("wiki.format_plain") as string;
}

export default function WikiContentWidget() {
  const nick  = usePageNick();
  const { t } = useI18n();
  const isList = useIsWikiList();

  const [sortField, setSortField] = createSignal<SortField>("name");
  const [sortDir,   setSortDir]   = createSignal<SortDir>("asc");

  function toggleSort(field: SortField) {
    if (sortField() === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sortedWikis = createMemo(() => {
    const field = sortField();
    const dir   = sortDir();
    return wikis().slice().sort((a, b) => {
      const cmp = field === "name"
        ? a.name.localeCompare(b.name)
        : a.mime_type.localeCompare(b.mime_type);
      return dir === "asc" ? cmp : -cmp;
    });
  });

  const [confirmDelete, setConfirmDelete] = createSignal<string | null>(null);
  const [deletingWiki, setDeletingWiki]   = createSignal(false);

  // ACL editor state — existing wiki
  const [aclWikiUrl, setAclWikiUrl]     = createSignal<string | null>(null);
  const [aclLoading, setAclLoading]     = createSignal(false);
  const [aclSaving, setAclSaving]       = createSignal(false);
  const [aclMode, setAclMode]           = createSignal<AclMode>("public");
  // Needed to recognise "Only me", which is stored as allow_cid = [own hash].
  const selfHash = useNavViewer();
  const [allowKeys, setAllowKeys]       = createSignal<Set<string>>(new Set<string>());
  const [denyKeys, setDenyKeys]         = createSignal<Set<string>>(new Set<string>());

  createEffect(() => {
    const n = nick();
    if (n) loadWikis(n);
  });

  async function handleDeleteWiki(wikiUrlName: string) {
    setDeletingWiki(true);
    try {
      await deleteWiki(nick(), wikiUrlName);
      setConfirmDelete(null);
      resetWikis();
      loadWikis(nick());
    } catch (err: any) {
      toast.error(err.message ?? t("wiki.error_deleting_wiki"));
    } finally {
      setDeletingWiki(false);
    }
  }

  async function openAclEditor(wikiUrlName: string) {
    setAclWikiUrl(wikiUrlName);
    setAclLoading(true);
    try {
      const data = await fetchWikiAcl(nick(), wikiUrlName);
      const mode = aclModeFrom(data, selfHash()?.hash);
      const { allow, deny } = aclEntryKeys(data, mode);
      setAllowKeys(allow);
      setDenyKeys(deny);
      setAclMode(mode);
    } catch (err: any) {
      toast.error(err.message ?? t("wiki.error_saving_privacy"));
      setAclWikiUrl(null);
    } finally {
      setAclLoading(false);
    }
  }

  function toggleEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    if (list === "allow") {
      setAllowKeys((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
      setDenyKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    } else {
      setDenyKeys((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
      setAllowKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  async function handleSaveAcl() {
    const wikiUrlName = aclWikiUrl();
    if (!wikiUrlName) return;
    setAclSaving(true);
    try {
      const mode = aclMode();
      let allow_cid: string[] = [], allow_gid: string[] = [];
      let deny_cid: string[]  = [], deny_gid: string[]  = [];

      if (mode === "custom") {
        for (const key of allowKeys()) {
          const [type, ...rest] = key.split(":");
          const xid = rest.join(":");
          if (type === "c") allow_cid.push(xid);
          else if (type === "g") allow_gid.push(xid);
        }
        for (const key of denyKeys()) {
          const [type, ...rest] = key.split(":");
          const xid = rest.join(":");
          if (type === "c") deny_cid.push(xid);
          else if (type === "g") deny_gid.push(xid);
        }
      }

      await saveWikiAcl(nick(), wikiUrlName, {
        allow_cid, allow_gid, deny_cid, deny_gid,
        scope: mode === "me" ? "private" : undefined,
      });
      const isNowPrivate = mode === "me" || (mode === "custom" && (allow_cid.length > 0 || allow_gid.length > 0 || deny_cid.length > 0 || deny_gid.length > 0));
      patchWiki(wikiUrlName, { is_private: isNowPrivate });
      toast.success(t("wiki.privacy_saved"));
      setAclWikiUrl(null);
    } catch (err: any) {
      toast.error(err.message ?? t("wiki.error_saving_privacy"));
    } finally {
      setAclSaving(false);
    }
  }

  return (
    <Show when={isList()}>
      <div class="space-y-4 max-w-3xl mx-auto p-4 pt-0">
        {/* Loading */}
        <Show when={wikisLoading()}>
          <div class="space-y-2">
            <For each={[1, 2, 3]}>
              {() => (
                <div class="bg-surface border border-rim rounded-xl p-4 h-16 animate-pulse" />
              )}
            </For>
          </div>
        </Show>

        {/* Permission denied */}
        <Show when={!wikisLoading() && wikisError() === "permission"}>
          <p class="text-muted text-sm text-center py-8">You don't have permission to view these wikis.</p>
        </Show>

        {/* Empty */}
        <Show when={!wikisLoading() && !wikisError() && wikis().length === 0}>
          <p class="text-muted text-sm text-center py-8">No wikis yet.</p>
        </Show>

        {/* Column headers + list */}
        <Show when={!wikisLoading() && !wikisError() && wikis().length > 0}>
          <div class="border-t border-rim" />
          <div class="flex items-center gap-3 px-3 text-[0.625rem] font-semibold uppercase tracking-wide text-muted select-none">
            <button
              onClick={() => toggleSort("name")}
              class={`flex-1 flex items-center gap-0.5 text-left transition-colors hover:text-txt ${
                sortField() === "name" ? "text-txt" : ""
              }`}
            >
              {t("wiki.name_col")}
              <Show when={sortField() === "name"}>
                <span class="ml-0.5 text-accent">{sortDir() === "asc" ? "↑" : "↓"}</span>
              </Show>
            </button>
            <button
              onClick={() => toggleSort("format")}
              class={`hidden sm:flex w-24 shrink-0 items-center gap-0.5 transition-colors hover:text-txt ${
                sortField() === "format" ? "text-txt" : ""
              }`}
            >
              <Show when={sortField() === "format"}>
                <span class="text-accent">{sortDir() === "asc" ? "↑" : "↓"}</span>
              </Show>
              {t("wiki.format_col")}
            </button>
            <Show when={isOwner()}>
              <span class="w-24 shrink-0" />
            </Show>
          </div>

          <div class="space-y-0.5">
            <For each={sortedWikis()}>
              {(wiki) => (
                <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-colors hover:bg-elevated">
                  <A
                    href={`/wiki/${nick()}/${wiki.url_name}`}
                    class="flex-1 min-w-0 text-sm font-medium text-txt hover:text-accent transition-colors truncate"
                  >
                    {wiki.name}
                  </A>

                  <span class="hidden sm:block w-24 shrink-0 text-xs text-muted">
                    {mimeLabel(wiki.mime_type, t as (k: string) => string)}
                  </span>

                  <Show when={isOwner()}>
                    <div class="flex items-center gap-1 shrink-0 w-24 justify-end">
                      {/* Privacy icon with tooltip */}
                      <div class="relative group/priv">
                        <button
                          type="button"
                          onClick={() => openAclEditor(wiki.url_name)}
                          class={`p-1.5 rounded-lg border transition-colors ${
                            wiki.is_private
                              ? "border-accent/40 text-accent hover:bg-accent-muted"
                              : "border-rim text-muted hover:text-accent hover:border-accent/40"
                          }`}
                        >
                          <Show when={wiki.is_private} fallback={<MdFillLock_open size={13} />}>
                            <MdFillLock size={13} />
                          </Show>
                        </button>
                        <div class="absolute bottom-full right-0 mb-1.5 px-2 py-1 rounded-md
                                    bg-surface border border-rim text-xs text-txt whitespace-nowrap
                                    pointer-events-none opacity-0 group-hover/priv:opacity-100
                                    transition-opacity z-10">
                          {wiki.is_private ? t("wiki.restricted_label") : t("wiki.public_label")}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setConfirmDelete(wiki.url_name)}
                        title={t("wiki.delete_wiki") as string}
                        class="p-1.5 rounded-lg border border-rim text-muted hover:text-red-400
                               hover:border-red-400/40 transition-colors"
                      >
                        <MdFillDelete size={13} />
                      </button>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Delete wiki confirmation modal */}
        <Show when={confirmDelete() !== null}>
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="bg-surface border border-rim rounded-xl p-6 space-y-4 max-w-sm w-full mx-4">
              <p class="text-txt text-sm">
                {t("wiki.delete_wiki")} <strong>{confirmDelete()}</strong>{t("wiki.delete_wiki_confirm")}
              </p>
              <div class="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg"
                >
                  {t("wiki.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteWiki(confirmDelete()!)}
                  disabled={deletingWiki()}
                  class="text-sm border border-rim text-red-400 hover:bg-elevated px-3 py-1.5 rounded-lg
                         disabled:opacity-50"
                >
                  {deletingWiki() ? t("wiki.deleting_wiki") : t("wiki.delete_wiki")}
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* Privacy / ACL modal */}
        <Show when={aclWikiUrl() !== null}>
          <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
            <div class="bg-surface border border-rim rounded-xl p-5 space-y-4 w-full max-w-sm mx-4 mb-4 sm:mb-0">
              <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold text-txt">{t("wiki.privacy_editor_title")}</h2>
                <button
                  type="button"
                  onClick={() => setAclWikiUrl(null)}
                  class="text-muted hover:text-txt transition-colors text-lg leading-none"
                >
                  ✕
                </button>
              </div>

              <Show when={aclLoading()}>
                <div class="h-10 bg-elevated rounded-lg animate-pulse" />
              </Show>

              <Show when={!aclLoading()}>
                <AclPicker
                  mode={aclMode()}
                  onModeChange={setAclMode}
                  allowEntries={allowKeys()}
                  denyEntries={denyKeys()}
                  onToggle={toggleEntry}
                  onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
                />
              </Show>

              <div class="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setAclWikiUrl(null)}
                  class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg"
                >
                  {t("wiki.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAcl}
                  disabled={aclSaving() || aclLoading()}
                  class="text-sm bg-accent-muted text-accent hover:bg-elevated border border-rim
                         px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {aclSaving() ? "…" : t("wiki.save")}
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
