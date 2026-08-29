import { Show } from "solid-js";
import LanguageSwitcher from "./LanguageSwitcher";
import ThemeToggle from "./ThemeToggle";
import HelpTrigger from "./HelpTrigger";
import { A } from "@solidjs/router";
import { BiRegularInfoCircle, BiRegularRss } from "solid-icons/bi";
import { MdFillCheck, MdOutlineEdit } from "solid-icons/md";
import type { NavViewer, NavActions } from "@utsukta/spa-core/lib/nav-api";
import Usermenu from "./UserMenu";
import { useI18n } from "@utsukta/spa-core/i18n";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets, setEditingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { openFeedModal } from "@utsukta/spa-core/store/feed-modal";

const CHANNEL_CONTEXT_MODULES = ["channel", "profile", "articles"];

interface NavUtilitiesProps {
  viewer?: NavViewer;
  actions?: NavActions;
  actionsOpen?: boolean;
  onUserMenuToggle?: () => void;
  moduleId?: string;
}

export default function NavUtilities(props: NavUtilitiesProps) {
  const { t } = useI18n();
  const viewerRole = useViewerRole();
  const isOwner = () => viewerRole() === "owner";
  const pageNick = usePageNick();
  const showFeedIcon = () => !isOwner() && CHANNEL_CONTEXT_MODULES.includes(props.moduleId ?? "");
  return (
    <>
      <Usermenu
        viewer={props.viewer}
        actions={props.actions}
        actionsOpen={props.actionsOpen}
        onUserMenuToggle={props.onUserMenuToggle}
      />

      <div class="mt-3 pt-2 border-t border-rim flex items-center gap-[2px] px-[4px] justify-evenly">
        <div use:helpable="nav.language">
          <LanguageSwitcher />
        </div>
        <div use:helpable="nav.theme">
          <ThemeToggle />
        </div>
        <Show when={isOwner()}>
          <button
            onClick={() => setEditingWidgets(!editingWidgets())}
            data-tour="nav.edit_layout"
            aria-pressed={editingWidgets()}
            aria-label={editingWidgets() ? t("widgets.done_editing") : t("widgets.edit_layout")}
            title={editingWidgets() ? t("widgets.done_editing") : t("widgets.edit_layout")}
            class={`p-[8px] rounded-lg transition-colors ${
              editingWidgets()
                ? "bg-accent text-accent-fg"
                : "text-muted hover:bg-elevated hover:text-txt"
            }`}
          >
            <Show when={editingWidgets()} fallback={<MdOutlineEdit size={18} />}>
              <MdFillCheck size={18} />
            </Show>
          </button>
        </Show>
        <Show when={showFeedIcon()}>
          <button
            onClick={() => openFeedModal(pageNick())}
            title={t("widgets.rss_feeds")}
            aria-label={t("widgets.rss_feeds")}
            class="inline-flex items-center justify-center p-[8px] rounded-lg text-muted hover:bg-elevated hover:text-txt transition-colors"
          >
            <BiRegularRss size={18} />
          </button>
        </Show>
        <div use:helpable="nav.help_mode">
          <HelpTrigger />
        </div>
        <div use:helpable="nav.siteinfo">
          <A
            href="/siteinfo"
            title={t("ui.site_info")}
            class="inline-flex items-center justify-center p-[8px] rounded-lg text-muted hover:bg-elevated hover:text-txt transition-colors"
          >
            <BiRegularInfoCircle size={18} />
          </A>
        </div>
      </div>
    </>
  );
}
