// Link list card (config: { title?, links: [{ label, url }] }). Only http(s)
// URLs are rendered — config is owner data but could be written by a hostile
// client, so javascript: and friends must never become anchors.

import { For, Show } from "solid-js";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdFillOpen_in_new } from "solid-icons/md";
import { Card } from "@ui/Card";

export interface LinkEntry {
  label: string;
  url: string;
}

export function validLinks(raw: unknown): LinkEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (l): l is LinkEntry =>
        !!l && typeof l === "object" &&
        typeof (l as LinkEntry).url === "string" &&
        /^https?:\/\//i.test((l as LinkEntry).url),
    )
    .map((l) => ({ label: String(l.label ?? "") || l.url, url: l.url }));
}

export default function LinkListWidget(props: WidgetProps) {
  const { t } = useI18n();
  const title = () => String(props.config?.title ?? "");
  const links = () => validLinks(props.config?.links);

  return (
    <Show
      when={links().length > 0}
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
          <div class="px-4 py-3">
            <h3 class="text-sm font-semibold text-txt">{title()}</h3>
          </div>
        </Show>
        <ul class="divide-y divide-rim">
          <For each={links()}>
            {(link) => (
              <li>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm text-txt
                         hover:bg-elevated hover:text-accent transition-colors"
                >
                  <span class="flex-1 truncate">{link.label}</span>
                  <MdFillOpen_in_new size={12} class="shrink-0 text-muted" />
                </a>
              </li>
            )}
          </For>
        </ul>
      </Card>
    </Show>
  );
}
