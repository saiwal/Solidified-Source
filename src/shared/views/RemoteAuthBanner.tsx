// src/shared/views/RemoteAuthBanner.tsx
import { type Component, Show } from "solid-js";
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
                  bg-amber-50 dark:bg-amber-900/30
                  border-b border-amber-200 dark:border-amber-700
                  text-amber-900 dark:text-amber-200"
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
                     bg-amber-200 dark:bg-amber-700 hover:bg-amber-300
                     dark:hover:bg-amber-600 transition-colors"
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
        </Show>
      </div>

    </Show>
  );
};

export default RemoteAuthBanner;
