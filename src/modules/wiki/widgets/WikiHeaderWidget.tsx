import { createSignal, For, Show } from "solid-js";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { canCreate, loadWikis, resetWikis } from "../store";
import { createWiki, WIKI_MIME_TYPES, WIKI_MIME_LABEL, type WikiMimeType } from "../api";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import AclPicker, { entryKey, type AclMode, type AclEntry } from "@/shared/editor/components/AclPicker";
import { useIsWikiList } from "../lib/isWikiList";

export default function WikiHeaderWidget() {
  const nick = usePageNick();
  const { t } = useI18n();
  const isList = useIsWikiList();

  const [creating, setCreating] = createSignal(false);
  const [newName, setNewName]   = createSignal("");
  const [busy, setBusy]         = createSignal(false);
  // Wiki content format + whether pages may deviate from it (iconfig
  // wiki/mimeType + wiki/typelock). Core defaults new wikis to markdown
  // (Mod_Wiki.php:221 lists it first); the SPA has always created bbcode,
  // so keep that as the default and let the user change it.
  const [newMime, setNewMime]   = createSignal<WikiMimeType>("text/bbcode");
  const [typeLock, setTypeLock] = createSignal(false);

  const [createAclMode, setCreateAclMode]     = createSignal<AclMode>("public");
  const [createAllowKeys, setCreateAllowKeys] = createSignal<Set<string>>(new Set<string>());
  const [createDenyKeys, setCreateDenyKeys]   = createSignal<Set<string>>(new Set<string>());

  function toggleCreateEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    if (list === "allow") {
      setCreateAllowKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
      setCreateDenyKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    } else {
      setCreateDenyKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
      setCreateAllowKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  function resetCreateForm() {
    setCreating(false);
    setNewName("");
    setNewMime("text/bbcode");
    setTypeLock(false);
    setCreateAclMode("public");
    setCreateAllowKeys(new Set<string>());
    setCreateDenyKeys(new Set<string>());
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    if (!newName().trim()) return;
    setBusy(true);
    try {
      const mode = createAclMode();
      let allow_cid: string[] = [], allow_gid: string[] = [];
      let deny_cid: string[]  = [], deny_gid: string[]  = [];

      if (mode === "custom") {
        for (const key of createAllowKeys()) {
          const [type, ...rest] = key.split(":");
          const xid = rest.join(":");
          if (type === "c") allow_cid.push(xid);
          else if (type === "g") allow_gid.push(xid);
        }
        for (const key of createDenyKeys()) {
          const [type, ...rest] = key.split(":");
          const xid = rest.join(":");
          if (type === "c") deny_cid.push(xid);
          else if (type === "g") deny_gid.push(xid);
        }
      }

      const res = await createWiki(nick(), {
        name: newName().trim(),
        mime_type: newMime(),
        type_lock: typeLock(),
        allow_cid, allow_gid, deny_cid, deny_gid,
        scope: mode === "me" ? "private" : undefined,
      });
      if (res.success) {
        resetCreateForm();
        resetWikis();
        loadWikis(nick());
      }
    } catch (err: any) {
      toast.error(err.message ?? t("wiki.error_creating"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={isList()}>
      <div class="space-y-4 max-w-5xl mx-auto p-4 pb-0">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold text-txt">{t("wiki.wikis")}</h1>
          <Show when={canCreate()}>
            <button
              type="button"
              onClick={() => creating() ? resetCreateForm() : setCreating(true)}
              class="text-sm border border-rim text-muted hover:bg-elevated px-3 py-1.5 rounded-lg transition-colors"
            >
              {creating() ? t("wiki.cancel") : t("wiki.new_wiki")}
            </button>
          </Show>
        </div>

        {/* Create form */}
        <Show when={creating()}>
          <form
            class="bg-surface border border-rim rounded-xl p-4 space-y-3"
            onSubmit={handleCreate}
          >
            <div class="space-y-1">
              <label class="text-xs text-muted font-medium">{t("wiki.wiki_name_label")}</label>
              <input
                type="text"
                class="w-full bg-surface border border-rim text-txt rounded-lg px-3 py-2 text-sm
                       hover:border-rim-strong focus:outline-none"
                placeholder={t("wiki.wiki_name_placeholder") as string}
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
                required
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs text-muted font-medium">{t("editor.format")}</label>
              <select
                class="w-full bg-surface border border-rim text-txt rounded-lg px-3 py-2 text-sm
                       hover:border-rim-strong focus:outline-none"
                value={newMime()}
                onChange={(e) => setNewMime(e.currentTarget.value as WikiMimeType)}
              >
                <For each={WIKI_MIME_TYPES}>
                  {(m) => <option value={m}>{t(WIKI_MIME_LABEL[m])}</option>}
                </For>
              </select>
              <label class="flex items-center gap-2 text-xs text-muted pt-1">
                <input
                  type="checkbox"
                  checked={typeLock()}
                  onChange={(e) => setTypeLock(e.currentTarget.checked)}
                />
                {t("wiki.type_lock_label")}
              </label>
            </div>

            <div class="space-y-1">
              <label class="text-xs text-muted font-medium">{t("wiki.privacy")}</label>
              <AclPicker
                mode={createAclMode()}
                onModeChange={setCreateAclMode}
                allowEntries={createAllowKeys()}
                denyEntries={createDenyKeys()}
                onToggle={toggleCreateEntry}
                onClear={() => { setCreateAllowKeys(new Set<string>()); setCreateDenyKeys(new Set<string>()); }}
              />
            </div>
            <button
              type="submit"
              disabled={busy()}
              class="bg-accent-muted text-accent px-4 py-2 rounded-lg text-sm
                     hover:bg-elevated disabled:opacity-50 transition-colors"
            >
              {busy() ? t("wiki.creating") : t("wiki.create_wiki")}
            </button>
          </form>
        </Show>
      </div>
    </Show>
  );
}
