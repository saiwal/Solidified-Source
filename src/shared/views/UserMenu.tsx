import type { NavViewer, NavActions } from "@utsukta/spa-core/lib/nav-api";
import { Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import NavItem from "./NavItem";
import { helpable } from "@utsukta/spa-core/lib/helpable";
void helpable;

interface NavUtilitiesProps {
  viewer?: NavViewer;
  actions?: NavActions;
  actionsOpen?: boolean;
  onUserMenuToggle?: () => void;
}

const Usermenu = (props: NavUtilitiesProps) => {
  const { t } = useI18n();
  const isAuthenticated = () =>
    props.viewer?.is_local || props.viewer?.is_remote || props.viewer?.is_admin;
  const isAnonymous = () =>
    props.viewer !== undefined && !isAuthenticated();

  return (
    <>
      {/* Authenticated: avatar toggle */}
      <Show when={isAuthenticated() && props.onUserMenuToggle}>
        <div class="mt-3 pt-2 border-t border-rim px-2.5">
          <button
            onClick={props.onUserMenuToggle}
            title={props.viewer!.name}
            data-tour="nav.user_menu"
            use:helpable="nav.account_menu"
            class={`
              w-full p-1.5 rounded-xl transition-all duration-150 ease-out
              flex items-center gap-2.5 min-w-0
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60
              ${props.actionsOpen
                ? "bg-elevated ring-1 ring-accent/30 shadow-sm"
                : "hover:bg-elevated"
              }
            `}
          >
            <div class="relative shrink-0">
              <img
                src={props.viewer!.avatar}
                alt={props.viewer!.name}
                class="w-9 h-9 rounded-lg object-cover select-none"
                loading="lazy"
              />
            </div>
            <span class="flex-1 text-sm font-medium text-txt truncate text-left">
              {props.viewer!.name}
            </span>
            <svg
              class={`w-3.5 h-3.5 shrink-0 text-muted transition-transform duration-200 ease-out
                      ${props.actionsOpen ? "rotate-180" : "rotate-0"}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </Show>

      {/* Anonymous: login / register nav items */}
      <Show when={isAnonymous() && props.actions?.login}>
        <div class="my-2 h-px bg-rim" />
        <div class="flex flex-col gap-0.5">
          <div use:helpable="nav.login">
            <NavItem href={props.actions!.login!} label={t("nav.login")} icon="login" />
          </div>
          <Show when={props.actions?.register}>
            <div use:helpable="nav.register">
              <NavItem href={props.actions!.register!} label={t("nav.register")} icon="register" />
            </div>
          </Show>
        </div>
      </Show>
    </>
  );
};

export default Usermenu;
