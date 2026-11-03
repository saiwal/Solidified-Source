// Vertical multilevel menu card (config: { menu, title? }) fed by one of the
// page owner's Hubzilla menus, for the right sidebar. Submenu items (links of
// the form "menu:<name>") expand as an indented accordion.

import { Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { WidgetProps } from "@utsukta/spa-core/types/module.types";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { editingWidgets } from "@utsukta/spa-core/store/widget-layout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { fetchMenuTree } from "@utsukta/spa-core/lib/menus";
import { MenuAccordion } from "./menu-shared";
import { Card } from "@ui/Card";
import { WidgetShell } from "@ui/WidgetShell";

function EditHint(props: { text: string }) {
  return (
    <Show when={editingWidgets()}>
      <Card class="px-(--ws-px) py-3">
        <p class="text-xs text-muted">{props.text}</p>
      </Card>
    </Show>
  );
}

export default function MenuTreeWidget(props: WidgetProps) {
  const { t } = useI18n();
  const nick = usePageNick();
  const menuName = () => String(props.config?.menu ?? "");
  const title = () => String(props.config?.title ?? "");

  const [tree] = createQueryResource(
    "menu-tree",
    () => (nick() && menuName() ? { nick: nick(), name: menuName() } : null),
    (p) => fetchMenuTree(p.nick, p.name),
  );

  return (
    <Show when={menuName()} fallback={<EditHint text={t("widgets.not_configured")} />}>
      <Show when={!tree.error} fallback={<EditHint text={t("widgets.item_unavailable")} />}>
        <Show when={tree()?.items.length}>
          <WidgetShell title={title() || undefined}>
            <nav class="p-1.5" aria-label={title() || menuName()}>
              <MenuAccordion items={tree()!.items} />
            </nav>
          </WidgetShell>
        </Show>
      </Show>
    </Show>
  );
}
