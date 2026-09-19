import { For, Show, type Component } from "solid-js";
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
import { openComposer } from "@/shared/editor/store/composer-host";

type IconType = Component<{ size?: number; class?: string }>;

export default function QuickComposeWidget() {
  const { t } = useI18n();
  const auth = useAuth();
  const nick = usePageNick();
  const navigate = useNavigate();
  const installedApps = useInstalledApps();

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
        onClick: () =>
          openComposer({
            kind: "post",
            scope: "post:new",
            title: t("editor.new_post"),
            props: { profileUid: auth()?.uid ?? 0 },
          }),
      });
    }
    list.push({
      key: "dm",
      label: t("hq.new_dm"),
      icon: MdOutlineMail,
      onClick: () =>
        openComposer({
          kind: "dm",
          scope: "dm:new",
          title: t("editor.dm_new_message"),
          props: { profileUid: auth()?.uid ?? 0 },
        }),
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
        onClick: () =>
          openComposer({
            kind: "article",
            scope: "article:new",
            title: t("articles.new_article"),
            props: { uid: auth()?.uid ?? 0, nick: nick() },
          }),
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

    </Show>
  );
}
