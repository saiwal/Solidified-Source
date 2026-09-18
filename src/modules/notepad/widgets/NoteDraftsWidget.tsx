import { createSignal, Show } from "solid-js";
import { storageDel } from "@utsukta/spa-core/lib/storage";
import DraftsWidgetBase, { type DraftEntry, type DraftsWidgetApi } from "@/shared/editor/components/DraftsWidgetBase";
import NoteComposerModal from "@/shared/editor/composers/NoteComposerModal";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { loadNotes } from "../store";

// ── Scope helpers ─────────────────────────────────────────────────────────────
// Note drafts carry scope "note:new" or "note:edit:<mid>"

function scopeParts(scope: string): { action: string; mid: string } {
  const [, action = "", ...rest] = scope.split(":");
  return { action, mid: rest.join(":") };
}

// ── Widget ────────────────────────────────────────────────────────────────────
// /notepad has no :nick param — it's always the logged-in user's own notepad,
// so unlike the channel/profile-visitable modules (articles, webpages, wiki)
// there's no viewer-role check needed here; visitorVisible: false is enough.

export default function NoteDraftsWidget() {
  const auth = useAuth();
  const { t } = useI18n();

  const [activeEntry, setActiveEntry] = createSignal<DraftEntry | null>(null);
  let api: DraftsWidgetApi | undefined;

  // For edit drafts the composer needs the note's mid (it posts to
  // /api/item/:mid/edit); field values come from the draft itself
  function noteInitial() {
    const entry = activeEntry();
    if (!entry) return undefined;
    const { action, mid } = scopeParts(entry.scope);
    if (action !== "edit" || !mid) return undefined;
    return {
      mid,
      body: entry.draft.body,
      mimetype: entry.draft.mimetype,
    };
  }

  return (
    <Show when={!auth.loading && auth()?.uid}>
      <DraftsWidgetBase
        scopeType="note"
        title={t("notepad.drafts")}
        emptyText={t("notepad.no_drafts_widget")}
        refreshTitle={t("notepad.refresh_drafts")}
        deleteTitle={t("notepad.delete_draft")}
        untitledText={t("notepad.untitled")}
        emptyDraftText={t("notepad.empty_draft")}
        badgeClassName="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/25"
        badgeLabel={(scope) => scopeParts(scope).action === "edit" ? t("notepad.draft_edit") : t("notepad.draft_new")}
        onLoad={(entry) => { setActiveEntry(entry); }}
        apiRef={(a) => { api = a; }}
      />

      {/* Note composer — opened when loading a draft */}
      <Show when={activeEntry() !== null}>
        <NoteComposerModal
          nick={auth()?.nick ?? ""}
          heading={noteInitial() ? t("notepad.edit_note") : t("notepad.new_note")}
          initial={noteInitial()}
          onClose={() => {
            // onSaved may have cleared it already — the composer fires both
            const entry = activeEntry();
            if (entry) void storageDel(`pending-draft:${entry.scope}`);
            setActiveEntry(null);
          }}
          onSaved={() => {
            setActiveEntry(null);
            void api?.reload();
            void loadNotes(true);
          }}
        />
      </Show>
    </Show>
  );
}
