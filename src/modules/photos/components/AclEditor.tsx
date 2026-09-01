import { createSignal, onMount, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { AclEntry } from "@/shared/editor/components/AclPicker";
import AclPicker, { entryKey, aclModeFrom, aclEntryKeys, type AclMode } from "@/shared/editor/components/AclPicker";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { fetchAcl, saveAcl } from "../api/api";

export default function AclEditor(props: {
  nick: string;
  type: "image" | "album";
  datum: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading]     = createSignal(true);
  const [saving, setSaving]       = createSignal(false);
  const [error, setError]         = createSignal("");
  const [mode, setMode]           = createSignal<AclMode>("public");
  // Needed to recognise "Only me", stored as allow_cid = [own hash].
  const selfHash = useNavViewer();
  const [allowKeys, setAllowKeys] = createSignal<Set<string>>(new Set<string>());
  const [denyKeys, setDenyKeys]   = createSignal<Set<string>>(new Set<string>());

  onMount(async () => {
    try {
      const data = await fetchAcl(props.nick, props.type, props.datum);
      const m = aclModeFrom(data, selfHash()?.hash);
      const { allow, deny } = aclEntryKeys(data, m);
      setAllowKeys(allow);
      setDenyKeys(deny);
      setMode(m);
    } catch {
      setError(t("photos.acl_error"));
    } finally {
      setLoading(false);
    }
  });

  function toggleEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    if (list === "allow") {
      setAllowKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
      setDenyKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    } else {
      setDenyKeys((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
      setAllowKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const m = mode();
      let allow_cid: string[] = [], allow_gid: string[] = [];
      let deny_cid: string[]  = [], deny_gid: string[]  = [];

      if (m === "custom") {
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

      await saveAcl(props.nick, props.type, props.datum, {
        allow_cid, allow_gid, deny_cid, deny_gid,
        scope: m === "me" ? "private" : undefined,
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("photos.acl_error"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="mt-3 p-3 bg-overlay rounded-xl border border-rim space-y-3">
      <p class="text-xs font-semibold text-muted uppercase tracking-wide">
        {t("photos.acl_privacy")}
      </p>

      <Show when={loading()}>
        <p class="text-xs text-muted animate-pulse">{t("photos.acl_loading")}</p>
      </Show>

      <Show when={!loading()}>
        <AclPicker
          mode={mode()}
          onModeChange={setMode}
          allowEntries={allowKeys()}
          denyEntries={denyKeys()}
          onToggle={toggleEntry}
          onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
        />

        <Show when={error()}>
          <p class="text-xs text-red-500">{error()}</p>
        </Show>

        <div class="flex items-center gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving()}
            class="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium
                   transition-opacity disabled:opacity-40"
          >
            {saving() ? t("photos.acl_saving") : t("photos.acl_save")}
          </button>
          <button
            onClick={props.onClose}
            class="px-2 py-1.5 rounded-lg text-xs text-muted hover:text-txt transition-colors"
          >
            {t("photos.cancel")}
          </button>
        </div>
      </Show>
    </div>
  );
}
