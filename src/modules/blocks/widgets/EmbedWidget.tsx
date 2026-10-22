// Sandboxed iframe embed (config: { url, height, title? }). http(s)-only,
// rendered with a restrictive sandbox so an owner-supplied embed can't
// script the parent page or navigate it.

import { Show } from "solid-js";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

function isEmbeddable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function EmbedWidget(props: WidgetProps) {
  const { t } = useI18n();
  const url = () => String(props.config?.url ?? "");
  const height = () => Math.max(100, Math.min(800, Number(props.config?.height ?? 300)));
  const title = () => String(props.config?.title ?? "");

  return (
    <Show
      when={url() && isEmbeddable(url())}
      fallback={
        <Show when={editingWidgets()}>
          <Card class="px-4 py-3">
            <p class="text-xs text-muted">{t("widgets.not_configured")}</p>
          </Card>
        </Show>
      }
    >
      <Card class="overflow-hidden">
        <Show when={title()}>
          <div class="px-4 py-2.5">
            <h3 class="text-sm font-semibold text-txt truncate">{title()}</h3>
          </div>
        </Show>
        <iframe
          src={url()}
          title={title() || "embed"}
          style={{ height: `${height()}px` }}
          class="w-full block border-0"
          loading="lazy"
          referrerpolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
      </Card>
    </Show>
  );
}
