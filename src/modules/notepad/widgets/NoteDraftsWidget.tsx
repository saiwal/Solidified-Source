import { Show } from "solid-js";
import { storageDel } from "@utsukta/spa-core/lib/storage";
import DraftsWidgetBase, { type DraftEntry } from "@/shared/editor/components/DraftsWidgetBase";
import { openComposer } from "@/shared/editor/store/composer-host";
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

  // For edit drafts the composer needs the note's mid (it posts to
  // /api/item/:mid/edit); field values come from the draft itself
  function noteInitial(entry: DraftEntry) {
    const { action, mid } = scopeParts(entry.scope);
    if (action !== "edit" || !mid) return undefined;
    return {
      mid,
      body: entry.draft.body,
      mimetype: entry.draft.mimetype,
    };
  }

  // Mounted by ComposerHost and keyed on the draft scope, so it survives
  // navigation and reloading the same draft surfaces the live composer.
  // No reload callback: DraftsWidgetBase already refetches on draftsVersion.
  function loadDraft(entry: DraftEntry) {
    const initial = noteInitial(entry);
    openComposer({
      kind: "note",
      scope: entry.scope,
      title: initial ? t("notepad.edit_note") : t("notepad.new_note"),
      props: {
        nick: auth()?.nick ?? "",
        initial,
        onClose: () => void storageDel(`pending-draft:${entry.scope}`),
        onSaved: () => void loadNotes(true),
      },
    });
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
        onLoad={loadDraft}
      />

    </Show>
  );
}
