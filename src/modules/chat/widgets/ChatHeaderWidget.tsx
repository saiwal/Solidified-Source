import { Show, createSignal } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { openChat } from "@/shared/views/modal-host";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { isOwner, createChatRoom } from "../store";
import {
  MdFillAdd,
} from "solid-icons/md";
import AclPicker, { entryKey, aclModeToScope, type AclMode, type AclEntry } from "@/shared/editor/components/AclPicker";

export default function ChatHeaderWidget() {
  const { t } = useI18n();
  const nick = usePageNick();
  const auth = useAuth();

  const [showForm, setShowForm] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newExpire, setNewExpire] = createSignal(120);
  const [aclMode, setAclMode] = createSignal<AclMode>("public");
  const [allowEntries, setAllowEntries] = createSignal<Set<string>>(new Set<string>());
  const [denyEntries, setDenyEntries] = createSignal<Set<string>>(new Set<string>());
  const [creating, setCreating] = createSignal(false);
  const [formError, setFormError] = createSignal<string | null>(null);
  const [sendInvite, setSendInvite] = createSignal(true);

  function toggleEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    const [getSet, setSet] = list === "allow"
      ? [allowEntries, setAllowEntries]
      : [denyEntries, setDenyEntries];
    const setOther = list === "allow" ? setDenyEntries : setAllowEntries;
    void getSet();
    setSet((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
    setOther((prev) => { const next = new Set(prev); next.delete(key); return next; });
  }

  function clearEntries() {
    setAllowEntries(new Set<string>());
    setDenyEntries(new Set<string>());
  }

  function splitEntries(entries: Set<string>): { cids: string[]; gids: string[] } {
    const cids: string[] = [];
    const gids: string[] = [];
    for (const key of entries) {
      const colon = key.indexOf(":");
      const type = key.slice(0, colon);
      const xid  = key.slice(colon + 1);
      if (type === "c") cids.push(xid);
      else if (type === "g") gids.push(xid);
    }
    return { cids, gids };
  }

  function resetForm() {
    setNewName("");
    setNewExpire(120);
    setAclMode("public");
    clearEntries();
    setFormError(null);
    setSendInvite(true);
  }

  async function handleCreate(e: Event) {
    e.preventDefault();
    const name = newName().trim();
    if (!name) return;

    const { cids: allowCids, gids: allowGids } = splitEntries(allowEntries());
    const { cids: denyCids, gids: denyGids } = splitEntries(denyEntries());

    if (aclMode() === "custom" && allowCids.length === 0 && allowGids.length === 0) {
      setFormError(t("chat.private_select_hint") as string);
      return;
    }

    setCreating(true);
    setFormError(null);
    try {
      const room = await createChatRoom(nick(), {
        name,
        expire: newExpire(),
        visibility: aclModeToScope(aclMode()),
        allow_cid: allowCids,
        allow_gid: allowGids,
        deny_cid: denyCids,
        deny_gid: denyGids,
      });
      if (sendInvite() && aclMode() === "custom" && allowCids.length > 0) {
        const uid = auth()?.uid;
        if (uid) {
          const roomUrl = `${window.location.origin}/chat/${nick()}/${room.id}`;
          for (const xchan of allowCids) {
            const fd = new FormData();
            // #^ marks it a bookmark link (the room name becomes its title), so the
            // recipient can save it straight into Bookmarked Rooms; zrl logs a
            // visitor from another hub in when they follow it.
            fd.append("body", `You've been invited to the chatroom #^[zrl=${roomUrl}]${name.replace(/[[\]]/g, "")}[/zrl]`);
            fd.append("mimetype", "text/bbcode");
            fd.append("obj_type", "Note");
            fd.append("profile_uid", String(uid));
            fd.append("type", "wall");
            fd.append("contact_allow[]", xchan);
            fd.append("return", "");
            fetch("/item", { method: "POST", credentials: "include", redirect: "manual", body: fd })
              .catch(() => {});
          }
        }
      }
      setShowForm(false);
      resetForm();
      openChat(nick(), room.id, room.name);
    } catch (err: any) {
      setFormError(err.message ?? "Failed to create room");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div class="max-w-5xl mx-auto space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold text-txt">{t("chat.chatrooms")}</h1>
          </div>
          <Show when={isOwner()}>
            <button
              onClick={() => { setShowForm((v) => !v); if (showForm()) resetForm(); }}
              class="flex items-center gap-1.5 text-sm border border-rim text-muted hover:bg-elevated hover:text-txt rounded-lg px-3 py-1.5 transition-colors"
            >
              <MdFillAdd class="text-base" />
              {t("chat.new_room")}
            </button>
          </Show>
        </div>

        <Show when={showForm()}>
          <form
            onSubmit={handleCreate}
            class="bg-surface border border-rim rounded-xl p-4 space-y-4"
          >
            <h2 class="text-sm font-medium text-txt">{t("chat.new_chatroom")}</h2>

            <input
              type="text"
              placeholder={t("chat.room_name_placeholder") as string}
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              class="w-full bg-surface border border-rim text-txt text-sm rounded-lg px-3 py-2 hover:border-rim-strong focus:outline-none focus:border-accent transition-colors"
              required
            />

            <div class="flex items-center gap-2">
              <label class="text-xs text-muted shrink-0">{t("chat.expire_after")}</label>
              <input
                type="number"
                min="0"
                max="10080"
                value={newExpire()}
                onInput={(e) => setNewExpire(parseInt(e.currentTarget.value) || 0)}
                class="w-24 bg-surface border border-rim text-txt text-sm rounded-lg px-3 py-1.5 hover:border-rim-strong focus:outline-none focus:border-accent transition-colors"
              />
              <span class="text-xs text-muted">{t("chat.minutes_never")}</span>
            </div>

            <div class="space-y-2">
              <p class="text-xs font-medium text-muted">{t("chat.visibility")}</p>
              <AclPicker
                mode={aclMode()}
                onModeChange={setAclMode}
                allowEntries={allowEntries()}
                denyEntries={denyEntries()}
                onToggle={toggleEntry}
                onClear={clearEntries}
              />
              <p class="text-[0.6875rem] text-muted">
                {aclMode() === "public" && t("chat.visibility_public")}
                {aclMode() === "connections" && t("chat.visibility_connections")}
                {aclMode() === "me" && t("chat.visibility_me")}
                {aclMode() === "custom" && t("chat.visibility_private")}
              </p>
            </div>

            <Show when={aclMode() === "custom"}>
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sendInvite()}
                  onChange={(e) => setSendInvite(e.currentTarget.checked)}
                  class="accent-accent w-3.5 h-3.5 cursor-pointer"
                />
                <span class="text-xs text-muted">Notify invited members</span>
              </label>
            </Show>

            <Show when={formError()}>
              <p class="text-xs text-red-500">{formError()}</p>
            </Show>

            <div class="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                class="text-sm border border-rim text-muted hover:bg-elevated rounded-lg px-3 py-1.5 transition-colors"
              >
                {t("chat.cancel")}
              </button>
              <button
                type="submit"
                disabled={creating()}
                class="text-sm bg-accent text-accent-fg rounded-lg px-4 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {creating() ? t("chat.creating") : t("chat.create")}
              </button>
            </div>
          </form>
        </Show>
      </div>
    </>
  );
}
