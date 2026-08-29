import { createSignal, For, Show, type Component } from "solid-js";
import { useNavigate } from "@solidjs/router";
import {
  MdOutlineEdit,
  MdOutlineMail,
  MdOutlineDescription,
  MdOutlineBook,
  MdOutlineArticle,
} from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isModuleActive, isAppInstalled } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import PostComposer from "@/shared/editor/composers/PostComposer";
import DMComposer from "@/shared/editor/composers/DMComposer";
import ArticleComposerModal from "@/shared/editor/composers/ArticleComposerModal";

type IconType = Component<{ size?: number; class?: string }>;

export default function QuickComposeWidget() {
  const { t } = useI18n();
  const auth = useAuth();
  const nick = usePageNick();
  const navigate = useNavigate();
  const installedApps = useInstalledApps();

  const [showPost, setShowPost] = createSignal(false);
  const [showDM, setShowDM] = createSignal(false);
  const [showArticle, setShowArticle] = createSignal(false);

  // Post has no routed SPA module to key off of (it's a plain Hubzilla
  // app), so it checks the raw installed-app name directly; DM is always
  // available; the rest gate through isModuleActive() against their module id.
  const actions = () => {
    const apps = installedApps();
    const list: { key: string; label: string; icon: IconType; onClick: () => void }[] = [];

    if (isAppInstalled(apps, "/rpost")) {
      list.push({
        key: "post",
        label: t("hq.new_post"),
        icon: MdOutlineEdit,
        onClick: () => setShowPost(true),
      });
    }
    list.push({
      key: "dm",
      label: t("hq.new_dm"),
      icon: MdOutlineMail,
      onClick: () => setShowDM(true),
    });
    if (isModuleActive("webpages", apps)) {
      list.push({
        key: "webpage",
        label: t("hq.new_webpage"),
        icon: MdOutlineDescription,
        onClick: () => navigate(`/webpages/${nick()}/new`),
      });
    }
    if (isModuleActive("wiki", apps)) {
      list.push({
        key: "wiki",
        label: t("hq.new_wiki_page"),
        icon: MdOutlineBook,
        onClick: () => navigate(`/wiki/${nick()}`),
      });
    }
    if (isModuleActive("articles", apps)) {
      list.push({
        key: "article",
        label: t("hq.new_article"),
        icon: MdOutlineArticle,
        onClick: () => setShowArticle(true),
      });
    }
    return list;
  };

  return (
    <Show when={actions().length > 0}>
      <div class="bg-surface border border-rim rounded-2xl shadow-sm p-3.5">
        <span class="text-xs font-medium uppercase tracking-wider text-muted">
          {t("hq.quick_compose")}
        </span>
        <div class="flex flex-wrap gap-2 mt-2.5">
          <For each={actions()}>
            {(action) => (
              <button
                type="button"
                data-tour={`hq.quick_compose.${action.key}`}
                onClick={action.onClick}
                class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rim text-sm
                       text-txt hover:bg-elevated hover:border-accent/40 transition-colors"
              >
                <action.icon size={16} class="text-accent shrink-0" />
                {action.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={showPost() && !auth.loading && auth()?.uid}>
        <PostComposer
          profileUid={auth()!.uid}
          open={true}
          onPosted={() => setShowPost(false)}
          onClose={() => setShowPost(false)}
        />
      </Show>

      <Show when={showDM() && !auth.loading && auth()?.uid}>
        <DMComposer
          profileUid={auth()!.uid}
          open={true}
          onSent={() => setShowDM(false)}
          onClose={() => setShowDM(false)}
        />
      </Show>

      <Show when={showArticle() && !auth.loading && auth()?.uid}>
        <ArticleComposerModal
          uid={auth()!.uid}
          nick={nick()}
          heading={t("articles.new_article")}
          onSaved={() => setShowArticle(false)}
          onClose={() => setShowArticle(false)}
        />
      </Show>
    </Show>
  );
}
