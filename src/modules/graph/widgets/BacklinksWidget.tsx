// "Linked from" — the items whose body links to the one on screen, via
// [[Title]] or a permalink. API: GET /spa/links/backlinks?path=<pathname>;
// the server works out the page's channel and filters for the viewer.
import { For, Show } from "solid-js";
import { useLocation } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { subjectNickFromPath } from "@utsukta/spa-core/store/site-config";
import { WidgetShell } from "@ui/WidgetShell";
import { ListRow } from "@ui/ListRow";
import { MdOutlineHub } from "solid-icons/md";
import { fetchBacklinks, TYPE_COLOR } from "../api";

// Single-item pages only; list/index pages have nothing to be linked to.
function itemPath(path: string): string | null {
  const seg = path.split("/").filter(Boolean);
  if ((seg[0] === "display" || seg[0] === "item") && seg.length === 2) return path;
  if ((seg[0] === "articles" || seg[0] === "cards") && seg.length === 3 && !["series", "deck"].includes(seg[2])) return path;
  if (seg[0] === "wiki" && seg.length === 4) return path;
  if (seg[0] === "page" && seg.length >= 3) return path;
  return null;
}

export default function BacklinksWidget() {
  const { t } = useI18n();
  const location = useLocation();
  const [data] = createQueryResource("links-backlinks", () => itemPath(location.pathname), fetchBacklinks);
  const nick = () => subjectNickFromPath(location.pathname);

  return (
    <Show when={itemPath(location.pathname) && data()?.from.length}>
      <WidgetShell
        title={t("graph.linked_from")}
        icon={<MdOutlineHub size={16} />}
        footer={
          <Show when={nick()}>
            <a href={`/graph/${nick()}`} class="block px-(--ws-px) py-2 text-xs text-accent-txt hover:underline">
              {t("nav.graph")}
            </a>
          </Show>
        }
      >
        <ul class="py-1">
          <For each={data()!.from}>
            {(n) => (
              <li>
                <ListRow
                  href={n.url ?? undefined}
                  class="px-(--ws-px)"
                  leading={<span class="mt-1.5 block w-2 h-2 rounded-full" style={{ background: TYPE_COLOR[n.type] }} />}
                  title={n.title}
                  meta={t(`graph.type_${n.type}`)}
                />
              </li>
            )}
          </For>
        </ul>
      </WidgetShell>
    </Show>
  );
}
