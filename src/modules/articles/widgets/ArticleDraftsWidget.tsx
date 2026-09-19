import { Show } from "solid-js";
import { storageDel } from "@utsukta/spa-core/lib/storage";
import DraftsWidgetBase, { type DraftEntry } from "@/shared/editor/components/DraftsWidgetBase";
import { openComposer } from "@/shared/editor/store/composer-host";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { resetPosts, loadArticles } from "../store";

// ── Scope helpers ─────────────────────────────────────────────────────────────
// Article drafts carry scope "article:new" or "article:edit:<uuid>"

function scopeParts(scope: string): { action: string; uuid: string } {
  const [, action = "", ...rest] = scope.split(":");
  return { action, uuid: rest.join(":") };
}

// ── Widget ────────────────────────────────────────────────────────────────────

export default function ArticleDraftsWidget() {
  const auth = useAuth();
  const role = useViewerRole();
  const pageNick = usePageNick();
  const { t } = useI18n();

  // For edit drafts the composer needs the article uuid (it posts to
  // /api/item/:uuid/edit); field values come from the draft itself
  function articleInitial(entry: DraftEntry) {
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

  // Mounted by ComposerHost and keyed on the draft scope, so it survives
  // navigation and reloading the same draft twice surfaces the live composer.
  // No reload callback: DraftsWidgetBase already refetches on draftsVersion.
  function loadDraft(entry: DraftEntry) {
    const initial = articleInitial(entry);
    openComposer({
      kind: "article",
      scope: entry.scope,
      title: initial ? t("articles.edit_article") : t("articles.new_article"),
      props: {
        uid: auth()!.uid,
        nick: pageNick(),
        initial,
        onClose: () => void storageDel(`pending-draft:${entry.scope}`),
        onSaved: () => {
          resetPosts();
          void loadArticles(pageNick());
        },
      },
    });
  }

  return (
    <Show when={role() === "owner" && !auth.loading && auth()?.uid}>
      <DraftsWidgetBase
        scopeType="article"
        title={t("articles.drafts")}
        emptyText={t("articles.no_drafts")}
        refreshTitle={t("articles.refresh_drafts")}
        deleteTitle={t("articles.delete_draft")}
        untitledText={t("articles.untitled")}
        emptyDraftText={t("articles.empty_draft")}
        badgeClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
        badgeLabel={(scope) => scopeParts(scope).action === "edit" ? t("articles.draft_edit") : t("articles.draft_new")}
        onLoad={loadDraft}
      />

    </Show>
  );
}
