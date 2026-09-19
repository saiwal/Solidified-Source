import { A, useLocation } from "@solidjs/router";
import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { biToNavIcon } from "@utsukta/spa-core/lib/nav-api";
export { biToNavIcon };
import {
  MdFillHome,
  MdFillGrid_view,
  MdFillSpace_dashboard,
  MdFillMail,
  MdFillImage,
  MdFillFolder,
  MdFillCalendar_month,
  MdFillChat,
  MdFillBookmark,
  MdFillArticle,
  MdFillShopping_cart,
  MdFillHelp,
  MdFillWeb,
  MdFillEdit_note,
  MdFillPeople,
  MdFillAccount_tree,
  MdFillPublic,
  MdFillLock,
  MdFillView_column,
  MdFillSettings,
  MdFillManage_accounts,
  MdFillLogout,
  MdFillLogin,
  MdFillPerson_add,
  MdFillAdmin_panel_settings,
  MdFillPerson,
  MdFillEdit,
  MdFillRss_feed,
  MdFillNote,
  MdFillHardware,
  MdFillVideogame_asset,
  MdOutlineDrag_indicator,
  MdFillGavel,
  MdFillStyle,
  MdFillPoll,
} from "solid-icons/md";


const ICON_MAP: Record<string, (size: number) => JSX.Element> = {
  home: (s) => <MdFillHome size={s} />,
  grid: (s) => <MdFillGrid_view size={s} />,
  dashboard: (s) => <MdFillSpace_dashboard size={s} />,
  hq: (s) => <MdFillSpace_dashboard size={s} />,
  mail: (s) => <MdFillMail size={s} />,
  image: (s) => <MdFillImage size={s} />,
  photos: (s) => <MdFillImage size={s} />,
  folder: (s) => <MdFillFolder size={s} />,
  files: (s) => <MdFillFolder size={s} />,
  cloud: (s) => <MdFillFolder size={s} />,
  calendar: (s) => <MdFillCalendar_month size={s} />,
  chat: (s) => <MdFillChat size={s} />,
  bookmark: (s) => <MdFillBookmark size={s} />,
  article: (s) => <MdFillArticle size={s} />,
  articles: (s) => <MdFillArticle size={s} />,
  cards: (s) => <MdFillStyle size={s} />,
  cart: (s) => <MdFillShopping_cart size={s} />,
  help: (s) => <MdFillHelp size={s} />,
  webpages: (s) => <MdFillWeb size={s} />,
  wiki: (s) => <MdFillEdit_note size={s} />,
  connections: (s) => <MdFillPeople size={s} />,
  directory: (s) => <MdFillAccount_tree size={s} />,
  public: (s) => <MdFillPublic size={s} />,
  groups: (s) => <MdFillLock size={s} />,
  pdl: (s) => <MdFillView_column size={s} />,
  network: (s) => <MdFillRss_feed size={s} />,
  pubstream: (s) => <MdFillPublic size={s} />,
  channel: (s) => <MdFillPerson size={s} />,
  settings: (s) => <MdFillSettings size={s} />,
  manage: (s) => <MdFillManage_accounts size={s} />,
  logout: (s) => <MdFillLogout size={s} />,
  login: (s) => <MdFillLogin size={s} />,
  remote: (s) => <MdFillLogin size={s} />,
  navhome: (s) => <MdFillHome size={s} />,
  register: (s) => <MdFillPerson_add size={s} />,
  admin: (s) => <MdFillAdmin_panel_settings size={s} />,
  person: (s) => <MdFillPerson size={s} />,
  edit: (s) => <MdFillEdit size={s} />,
  notepad: (s) => <MdFillNote size={s} />,
  tools: (s) => <MdFillHardware size={s} />,
	games: (s) => <MdFillVideogame_asset size={s}/>,
  moderate: (s) => <MdFillGavel size={s} />,
  poll: (s) => <MdFillPoll size={s} />,
};

export function getNavIcon(token?: string, size = 20): JSX.Element {
  if (!token) return <MdFillGrid_view size={size} />;
  const f = ICON_MAP[token];
  return f ? f(size) : <MdFillGrid_view size={size} />;
}

interface Props {
  href: string | (() => string);
  label: string | (() => string);
  icon?: string;
  /** Live count badge (an unread total). Falsy = nothing rendered. */
  badge?: () => number | undefined;
  /** Renders a drag handle beside the link so the item can be reordered. */
  draggable?: boolean;
  dragging?: boolean;
  onDragHandlePointerDown?: (e: PointerEvent) => void;
  onDragHandleKeyDown?: (e: KeyboardEvent) => void;
}

const itemClass =
  "group relative flex items-center gap-3 rounded-xl px-2.5 py-2 " +
  "text-sm text-muted transition-colors duration-150 " +
  "hover:bg-elevated hover:text-txt";

const activeClass = "!bg-elevated !text-txt font-medium";

const NavItem: Component<Props> = (props) => {
  const { t } = useI18n();
  const href = () =>
    typeof props.href === "function" ? props.href() : props.href;
  const label = () =>
    typeof props.label === "function" ? props.label() : props.label;

  // Absolute URLs (http/https) must do a hard navigation so the target
  // domain serves its own theme rather than the SPA intercepting the route.
  const isAbsolute = () => /^https?:\/\//.test(href());

  const location = useLocation();
  const isCurrentPage = () => {
    if (isAbsolute()) return false;
    const h = href();
    if (h === "/") return location.pathname === "/";
    return location.pathname.startsWith(h.split("/:")[0].split("?")[0]);
  };

  const content = () => (
    <>
      <span aria-hidden="true" class="shrink-0 w-5 h-5 flex items-center justify-center">
        {getNavIcon(props.icon, 20)}
      </span>
      <span class="truncate leading-tight label">{label()}</span>
      <Show when={props.badge?.()}>
        {(n) => (
          <span class="ml-auto shrink-0 min-w-[1.25rem] px-1 h-5 rounded-full bg-accent text-surface
                       text-[0.625rem] font-bold flex items-center justify-center tabular-nums label">
            {n()}
          </span>
        )}
      </Show>
    </>
  );

  const link = () => (
    <Show
      when={isAbsolute()}
      fallback={
        <A href={href()} end={href() === "/"} class={itemClass} activeClass={activeClass} aria-current={isCurrentPage() ? "page" : undefined}>
          {content()}
        </A>
      }
    >
      <a
        href={href()}
        class={itemClass}
        aria-current={isCurrentPage() ? "page" : undefined}
        onClick={(e) => {
          e.preventDefault();
          window.location.replace(href());
        }}
      >
        {content()}
      </a>
    </Show>
  );

  return (
    <Show when={props.draggable} fallback={link()}>
      <div
        class="flex items-center gap-0.5 rounded-xl transition-opacity"
        classList={{ "opacity-50": props.dragging }}
      >
        <div class="flex-1 min-w-0">{link()}</div>
        <button
          type="button"
          aria-label={t("nav.drag_reorder")}
          title={t("nav.drag_reorder")}
          onPointerDown={props.onDragHandlePointerDown}
          onKeyDown={props.onDragHandleKeyDown}
          class="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-muted/60
                 hover:bg-elevated hover:text-txt cursor-grab active:cursor-grabbing touch-none
                 focus:outline-none focus:ring-2 focus:ring-accent transition-colors"
        >
          <MdOutlineDrag_indicator size={16} />
        </button>
      </div>
    </Show>
  );
};

export default NavItem;
