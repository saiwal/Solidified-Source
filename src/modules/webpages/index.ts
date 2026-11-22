import { registerModule } from '@utsukta/spa-core/module-registry';
import { useI18n } from '@utsukta/spa-core/i18n';
import { usePageNick } from '@utsukta/spa-core/store/site-config';
import { currentPageTemplateId, currentPageChrome } from './store';

registerModule({
  id: 'webpages',
  pageTemplate: () => currentPageTemplateId() ?? undefined,
  pageChrome: () => currentPageChrome() ?? undefined,
  routes: [
    { path: '/webpages/:nick/new',       component: () => import('./views/WebpageEditorView') },
    { path: '/webpages/:nick/menus',     component: () => import('./views/MenusView') },
    { path: '/webpages/:nick/layouts',   component: () => import('./views/LayoutTemplatesView') },
    { path: '/webpages/:nick/blocks/new',       component: () => import('./views/BlockEditorView') },
    { path: '/webpages/:nick/blocks/edit/:iid', component: () => import('./views/BlockEditorView') },
    { path: '/webpages/:nick/blocks',           component: () => import('./views/BlocksView') },
    { path: '/webpages/:nick/edit/:iid', component: () => import('./views/WebpageEditorView') },
    { path: '/webpages',                 component: () => import('./views/WebpagesView') },
    { path: '/webpages/:nick',           component: () => import('./views/WebpagesView') },
    { path: '/page/:nick/*path',         component: () => import('./views/PageView') },
  ],
  navItem: {
    label: () => useI18n().t('nav.webpages'),
    icon: 'webpages',
    path: '/webpages',
    href: () => `/webpages/${usePageNick()()}`,
    context: 'all',
  },
  widgets: [
    {
      id: "webpages.header",
      helpTarget: "webpages",
      label: () => useI18n().t("widgets.webpages_header"),
      loader: () => import("./widgets/WebpagesHeaderWidget"),
      slot: "header",
      defaultModules: ["webpages"],
      contexts: ["webpages"],
      locked: true,
    },
    {
      id: "webpages.content",
      helpTarget: "webpages",
      label: () => useI18n().t("widgets.webpages_content"),
      loader: () => import("./widgets/WebpagesContentWidget"),
      slot: "contentTop",
      defaultModules: ["webpages"],
      contexts: ["webpages"],
      locked: true,
    },
    {
      id: "webpages.drafts",
      label: () => useI18n().t("widgets.webpage_drafts"),
      loader: () => import("./widgets/WebpageDraftsWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "widgets.drafts",
    },
  ],
  permissions: [],
  appUrlSlug: "/webpages/",
});
