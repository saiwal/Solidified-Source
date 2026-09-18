import { registerModule } from "@utsukta/spa-core/module-registry";
import { useI18n } from "@utsukta/spa-core/i18n";

registerModule({
  id: "notepad",
  routes: [
    { path: "/notepad", component: () => import("./views/NotepadView") },
  ],
  requiresAuth: true,
  navItem: {
    label: () => useI18n().t("notepad.title"),
    icon: "notepad",
    path: "/notepad",
    href: "/notepad",
		hidden: false,
    context: "local",
  },
  slots: {},
  widgets: [
    {
      id: "notepad.header",
      label: () => useI18n().t("widgets.notepad_header"),
      loader: () => import("./widgets/NotepadHeaderWidget"),
      slot: "header",
      defaultModules: ["notepad"],
      contexts: ["notepad"],
      locked: true,
    },
    {
      id: "notepad.content",
      label: () => useI18n().t("widgets.notepad_content"),
      loader: () => import("./widgets/NotepadContentWidget"),
      slot: "contentTop",
      defaultModules: ["notepad"],
      contexts: ["notepad"],
      locked: true,
    },
    {
      // Opt-in placement on any page's sidebar — jot a note without leaving
      // where you are. Not shown by default anywhere, including notepad
      // itself (which already has a full composer inline).
      id: "notepad.quick",
      label: () => useI18n().t("widgets.note_quick"),
      loader: () => import("./widgets/QuickNoteWidget"),
      slot: "right",
      defaultModules: [],
      contexts: "any",
      visitorVisible: false,
      helpTarget: "widgets.quick_note",
    },
    {
      // Style (list | calendar) comes from the widget config.
      id: "notepad.archive",
      label: () => useI18n().t("widgets.note_archive"),
      loader: () => import("./widgets/NoteArchiveWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      visitorVisible: false,
      configComponent: () => import("@/shared/stream/components/ArchiveStyleConfig"),
      helpTarget: "widgets.archive",
    },
    {
      // A note's categories are its notebooks.
      // Style (list | cloud) and rainbow mode come from the widget config.
      id: "notepad.categories",
      label: () => useI18n().t("widgets.note_categories"),
      loader: () => import("./widgets/NoteCategoryWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      visitorVisible: false,
      configComponent: () => import("@/shared/stream/components/CategoryStyleConfig"),
      helpTarget: "widgets.categories",
    },
    {
      id: "notepad.drafts",
      label: () => useI18n().t("widgets.note_drafts"),
      loader: () => import("./widgets/NoteDraftsWidget"),
      slot: "right",
      visitorVisible: false,
      helpTarget: "widgets.drafts",
    },
    {
      // Style (cloud | list) and rainbow mode come from the widget config.
      id: "notepad.tags",
      label: () => useI18n().t("widgets.note_tags"),
      loader: () => import("./widgets/NoteTagWidget"),
      slot: ["right", "footer"],
      defaultSlot: "right",
      visitorVisible: false,
      configComponent: () => import("@/shared/stream/components/TagStyleConfig"),
      helpTarget: "widgets.tags",
    },
  ],
  permissions: [],
});
