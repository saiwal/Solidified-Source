import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";

registerModule({
  id: "articles",
  routes: [
    { path: "/articles", component: () => import("./views/ArticlesView") },
    {
      path: "/articles/:nick",
      component: () => import("./views/ArticlesView"),
    },
    // Series routes register before the :uuid catch-all so the literal
    // "series" segment isn't swallowed by it.
    {
      path: "/articles/:nick/series",
      component: () => import("./views/SeriesIndexView"),
    },
    {
      path: "/articles/:nick/series/:name",
      component: () => import("./views/SeriesView"),
    },
    {
      path: "/articles/:nick/:uuid",
      component: () => import("./views/ArticleView"),
    },
  ],
  navItem: {
    label: () => useI18n().t("nav.articles"),
    icon: "article",
    path: "/articles",
    href: () => `/articles/${usePageNick()()}`,
    context: "all",
    hidden: false,
  },
  widgets: [
    {
      id: "articles.header",
      label: () => useI18n().t("widgets.articles_header"),
      loader: () => import("./widgets/ArticlesHeaderWidget"),
      slot: "header",
      defaultModules: ["articles"],
      contexts: ["articles"],
      locked: true,
    },
    {
      id: "articles.content",
      label: () => useI18n().t("widgets.articles_content"),
      loader: () => import("./widgets/ArticlesContentWidget"),
      slot: "contentTop",
      defaultModules: ["articles"],
      contexts: ["articles"],
      locked: true,
    },
    {
      id: "articles.drafts",
      label: () => useI18n().t("widgets.article_drafts"),
      loader: () => import("./widgets/ArticleDraftsWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "widgets.drafts",
    },
    {
      id: "articles.popular",
      label: () => useI18n().t("widgets.popular_articles"),
      loader: () => import("./widgets/ArticlePopularWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "articles"],
      helpTarget: "widgets.popular_articles",
    },
    {
      // Style (list | cloud) and rainbow mode come from the widget config.
      id: "articles.categories",
      label: () => useI18n().t("widgets.article_categories"),
      loader: () => import("./widgets/ArticleCategoryWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      configComponent: () => import("@/shared/stream/components/CategoryStyleConfig"),
      helpTarget: "widgets.categories",
    },
    {
      // Style (cloud | list) and rainbow mode come from the widget config.
      id: "articles.tags",
      label: () => useI18n().t("widgets.article_tags"),
      loader: () => import("./widgets/ArticleTagWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      configComponent: () => import("@/shared/stream/components/TagStyleConfig"),
      helpTarget: "widgets.tags",
    },
    {
      // Opt-in archive — picker only, no default placement.
      // Style (list | calendar) comes from the widget config.
      id: "articles.archive",
      label: () => useI18n().t("widgets.archive"),
      loader: () => import("./widgets/ArticleArchiveWidget"),
      slot: ["right", "footer"],
      defaultModules: [],
      contexts: ["articles"],
      configComponent: () => import("@/shared/stream/components/ArchiveStyleConfig"),
      helpTarget: "widgets.archive",
    },
    {
      // Opt-in article showcase; place several, each configured with an article
      id: "articles.teaser",
      label: () => useI18n().t("widgets.article_teaser"),
      loader: () => import("./widgets/ArticleTeaserWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["channel", "profile", "articles"],
      multiInstance: true,
      configComponent: () => import("./widgets/ArticleTeaserConfig"),
      helpTarget: "widgets.article_teaser",
    },
    {
      // Opt-in series index — picker only, no default placement
      id: "articles.series",
      label: () => useI18n().t("widgets.article_series"),
      loader: () => import("./widgets/ArticleSeriesWidget"),
      slot: "right",
      defaultModules: [],
      contexts: ["articles"],
      helpTarget: "widgets.article_series",
    },
  ],
  permissions: [],
  appUrlSlug: "/articles/",
});
