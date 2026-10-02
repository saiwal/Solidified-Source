// src/modules/messenger/NewDmPane.tsx
// A new DM, composed in Messenger's right pane: recipients, a subject, and
// the same chat composer a thread reply uses. Sending opens the new thread.
// The payload is DMComposer's: POST /spa/item with scope "custom" and only
// contact_allow is what makes the server store it as a DM (item_private = 2).
import { For, Show, createSignal } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiFetch, apiError } from "@utsukta/spa-core/lib/fetch";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import RecipientField from "@/shared/editor/components/RecipientField";
import { entryKey } from "@/shared/editor/components/AclPicker";
import { fetchConnections, type AclEntry } from "@/modules/network/api";
import { BackButton } from "./DmPane";
import ChatComposer from "@/modules/chat/ChatComposer";

export default function NewDmPane(props: { base: string }) {
  const { t } = useI18n();
  const auth = useAuth();
  const navigate = useNavigate();
  // Seeded by "new message" on a visited channel, or a person's new-thread button.
  const seed = (useLocation().state as { to?: AclEntry[] } | undefined)?.to ?? [];
  const [to, setTo] = createSignal<AclEntry[]>(seed);
  const [subject, setSubject] = createSignal("");

  // Who has granted us post_mail; anyone else's hub drops the DM silently.
  // RecipientField's search is already limited to them, seeded chips aren't.
  // Matched on hash or address: one identity can own several xchan rows.
  const [permitted, setPermitted] = createSignal<AclEntry[] | null>(null);
  void fetchConnections({ type: "m", count: 500 }).then(setPermitted, () => setPermitted([]));
  const permittedFor = (r: AclEntry) =>
    permitted()?.find((c) => c.xid === r.xid || (!!r.link && c.link?.toLowerCase() === r.link.toLowerCase()));
  const blocked = () => (permitted() ? to().filter((r) => !permittedFor(r)) : []);

  async function send(body: string, mimetype: string) {
    if (!to().length) throw new Error(t("editor.dm_recipient_required") as string);
    if (blocked().length) {
      throw new Error(t("editor.dm_recipient_not_permitted", { name: blocked().map((r) => r.name).join(", ") }) as string);
    }
    const hashes = to().map((r) => permittedFor(r)?.xid ?? r.xid);
    const res = await apiFetch("/spa/item", {
      method: "POST",
      body: JSON.stringify({
        body,
        title: subject().trim(),
        mimetype,
        profile_uid: auth()?.uid ?? 0,
        scope: "custom",
        contact_allow: hashes,
        group_allow: [],
        contact_deny: [],
        group_deny: [],
      }),
    });
    if (!res.ok) throw await apiError(res);
    const uuid = (await res.json())?.data?.post?.uuid;
    void queryClient.invalidateQueries({ queryKey: ["messenger-dms"] });
    // Same key Messenger groups by (see dms.ts): the sorted recipient hashes.
    const key = [...hashes].sort((a, b) => a.localeCompare(b)).join(",");
    navigate(uuid ? `${props.base}/dms/${encodeURIComponent(key)}/${uuid}` : `${props.base}/dms`, { replace: true });
  }

  return (
    <div class="flex flex-col flex-1 min-h-0">
      <div class="flex items-center gap-3 px-3 py-2.5 border-b border-rim shrink-0">
        <BackButton href={`${props.base}/dms`} />
        <p class="flex-1 text-sm font-medium text-txt">{t("messenger.new_dm")}</p>
      </div>
      <div class="px-4 py-2 border-b border-rim space-y-1 shrink-0">
        <RecipientField
          entries={to}
          onAdd={(e) => { if (!to().some((r) => entryKey(r) === entryKey(e))) setTo([...to(), e]); }}
          onRemove={(e) => setTo(to().filter((r) => entryKey(r) !== entryKey(e)))}
        />
        <Show when={blocked().length}>
          <For each={blocked()}>
            {(r) => <p class="text-xs text-red-500">{t("editor.dm_recipient_not_permitted", { name: r.name })}</p>}
          </For>
        </Show>
        <input
          type="text"
          value={subject()}
          onInput={(e) => setSubject(e.currentTarget.value)}
          placeholder={t("editor.dm_subject_placeholder") as string}
          class="w-full bg-transparent text-sm text-txt py-1.5 border-t border-rim outline-none placeholder:text-muted"
        />
      </div>
      <div class="flex-1" />
      <ChatComposer send={send} scope="dm:messenger:new" placeholder={t("messenger.reply_placeholder") as string} />
    </div>
  );
}
