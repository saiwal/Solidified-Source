import { useNavigate } from "@solidjs/router";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isModuleActive, isAppInstalled } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { openComposer } from "@/shared/views/modal-host";

export type QuickAction = {
  key: string;
  label: string;
  /** Nav icon token — rendered with getNavIcon(), so an action wears the same
   *  icon as its nav item. */
  icon: string;
  onClick: () => void;
};

/**
 * The "create something" actions shared by the HQ quick-compose widget and the
 * quick post composer's action row — one list so the two can't drift.
 *
 * Post has no routed SPA module to key off of (it's a plain Hubzilla app), so
 * it checks the raw installed-app name directly; DM is always available; the
 * rest gate through isModuleActive() against their module id.
 */
export function useQuickActions() {
  const { t } = useI18n();
  const auth = useAuth();
  const nick = usePageNick();
  const navigate = useNavigate();
  const installedApps = useInstalledApps();

  return (): QuickAction[] => {
    const apps = installedApps();
    const list: QuickAction[] = [];

    if (isAppInstalled(apps, "/rpost")) {
      list.push({
        key: "post",
        label: t("hq.new_post"),
        icon: "edit",
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
      icon: "mail",
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
        icon: "webpages",
        onClick: () => navigate(`/webpages/${nick()}/new`),
      });
    }
    if (isModuleActive("wiki", apps)) {
      list.push({
        key: "wiki",
        label: t("hq.new_wiki_page"),
        icon: "wiki",
        onClick: () => navigate(`/wiki/${nick()}`),
      });
    }
    if (isModuleActive("articles", apps)) {
      list.push({
        key: "article",
        label: t("hq.new_article"),
        icon: "articles",
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
}
