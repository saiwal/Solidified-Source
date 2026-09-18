import { createSignal, Show } from "solid-js";
import { storageDel } from "@utsukta/spa-core/lib/storage";
import DraftsWidgetBase, { type DraftEntry, type DraftsWidgetApi } from "@/shared/editor/components/DraftsWidgetBase";
import CardComposerModal from "@/shared/editor/composers/CardComposerModal";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { resetPosts, loadCards } from "../store";

// ── Scope helpers ─────────────────────────────────────────────────────────────
// Card drafts carry scope "card:new" or "card:edit:<uuid>"

function scopeParts(scope: string): { action: string; uuid: string } {
  const [, action = "", ...rest] = scope.split(":");
  return { action, uuid: rest.join(":") };
}

// ── Widget ────────────────────────────────────────────────────────────────────

export default function CardDraftsWidget() {
  const auth = useAuth();
  const role = useViewerRole();
  const pageNick = usePageNick();
  const { t } = useI18n();

  const [activeEntry, setActiveEntry] = createSignal<DraftEntry | null>(null);
  let api: DraftsWidgetApi | undefined;

  // For edit drafts the composer needs the card uuid (it posts to
  // /api/item/:uuid/edit); field values come from the draft itself
  function cardInitial() {
    const entry = activeEntry();
    if (!entry) return undefined;
    const { action, uuid } = scopeParts(entry.scope);
    if (action !== "edit" || !uuid) return undefined;
    const d = entry.draft;
    return {
      uuid,
      title: d.title,
      summary: d.summary,
      slug: d.slug,
      category: d.category,
      body: d.body,
    };
  }

  return (
    <Show when={role() === "owner" && !auth.loading && auth()?.uid}>
      <DraftsWidgetBase
        scopeType="card"
        title={t("cards.drafts")}
        emptyText={t("cards.no_drafts")}
        refreshTitle={t("cards.refresh_drafts")}
        deleteTitle={t("cards.delete_draft")}
        untitledText={t("cards.untitled")}
        emptyDraftText={t("cards.empty_draft")}
        badgeClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
        badgeLabel={(scope) => scopeParts(scope).action === "edit" ? t("cards.draft_edit") : t("cards.draft_new")}
        onLoad={(entry) => { setActiveEntry(entry); }}
        apiRef={(a) => { api = a; }}
      />

      {/* Card composer — opened when loading a draft */}
      <Show when={activeEntry() !== null}>
        <CardComposerModal
          uid={auth()!.uid}
          nick={pageNick()}
          heading={cardInitial() ? t("cards.edit_card") : t("cards.new_card")}
          initial={cardInitial()}
          onClose={() => {
            // onSaved may have cleared it already — the composer fires both
            const entry = activeEntry();
            if (entry) void storageDel(`pending-draft:${entry.scope}`);
            setActiveEntry(null);
          }}
          onSaved={() => {
            setActiveEntry(null);
            void api?.reload();
            resetPosts();
            void loadCards(pageNick());
          }}
        />
      </Show>
    </Show>
  );
}
