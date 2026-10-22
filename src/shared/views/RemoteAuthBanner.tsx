// src/shared/views/RemoteAuthBanner.tsx
import { type Component, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import type { ViewerRole } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlinePublic, MdOutlineVisibility } from "solid-icons/md";

interface Props {
  role: ViewerRole;
  subjectNick: string;
  homeUrl?: string;
}

const RemoteAuthBanner: Component<Props> = (props) => {
  const { t } = useI18n();
  const location = useLocation();
  const loginHref = () =>
    `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
  return (
    <Show
      when={
        props.role !== "owner" &&
        props.role !== "local" &&
        props.role !== "admin"
      }
    >
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm
                  bg-warning-muted
                  border-b border-warning/40
                  text-warning-txt"
      >
        {/* Remote authenticated */}
        <Show when={props.role === "remote"}>
          <MdOutlinePublic class="w-4 h-4 opacity-70 shrink-0" />
          <span class="flex-1 min-w-0">
            <Show
              when={props.subjectNick}
              fallback={<>{t("ui.remote_visitor")}</>}
            >
              {t("ui.remote_visitor_channel", { nick: props.subjectNick })}
            </Show>
          </span>
          <Show when={props.homeUrl}>
            <a
              href={props.homeUrl}
              class="shrink-0 basis-full sm:basis-auto text-center sm:text-left px-3 py-1 rounded-full text-xs font-medium
                   bg-warning-muted hover:bg-warning
                   transition-colors"
            >
              {t("ui.go_home_link")}
            </a>
          </Show>
        </Show>

        {/* Anonymous */}
        <Show when={props.role === "anonymous"}>
          <MdOutlineVisibility class="w-4 h-4 opacity-70 shrink-0" />
          <span class="flex-1 min-w-0">
            <Show
              when={props.subjectNick}
              fallback={<>{t("ui.remote_visitor")}</>}
            >
              {t("ui.remote_guest", { nick: props.subjectNick })}
            </Show>
          </span>
          <A
            href={loginHref()}
            class="shrink-0 basis-full sm:basis-auto text-center sm:text-left px-3 py-1 rounded-full text-xs font-medium
                   bg-warning-muted hover:bg-warning
                   transition-colors"
          >
            {t("nav.login")}
          </A>
        </Show>
      </div>

    </Show>
  );
};

export default RemoteAuthBanner;
