// What the /graph map shows: item types, hashtags, categories, drafts. State
// lives in ../filters (shared with GraphView); the graph itself comes from the
// same query cache the map fills, so this costs no extra request.
import { createMemo, createSignal, For, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick, useSubjectNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { WidgetShell } from "@ui/WidgetShell";
import { Chip } from "@ui/Chip";
import { Toggle } from "@ui/Toggle";
import { Collapsible } from "@ui/Collapsible";
import { MdOutlineExpand_more, MdOutlineFilter_alt } from "solid-icons/md";
import { fetchGraph } from "../api";
import { NodeShape } from "../NodeShape";
import { baseGraph, isShown, presentItemTypes, showDrafts, termCounts, toggleDrafts, toggleShown } from "../filters";

function Heading(props: { children: string }) {
  return (
    <p class="pt-3 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">{props.children}</p>
  );
}

export default function GraphFiltersWidget() {
  const { t } = useI18n();
  const subject = useSubjectNick();
  const pageNick = usePageNick();
  const nick = () => subject() || pageNick() || null;
  const [graph] = createQueryResource("links-graph", nick, fetchGraph);
  // Drafts on, so their tags count too: the Drafts switch is what hides them.
  const all = createMemo(() => baseGraph(graph(), true));
  const types = createMemo(() => presentItemTypes(all()));
  const hasDrafts = createMemo(() => !!graph()?.nodes.some((n) => n.draft));

  return (
    <WidgetShell title={t("widgets.graph_filters")} icon={<MdOutlineFilter_alt size={16} />}>
      <div class="px-(--ws-px) pb-3">
        <Show when={types().length}>
          <Heading>{t("graph.item_types")}</Heading>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label={t("graph.item_types")}>
            <For each={types()}>
              {(ty) => (
                <Chip size="sm" selected={isShown(ty)} onClick={() => toggleShown(ty)} icon={<NodeShape type={ty} />}>
                  {t(`graph.type_${ty}`)}
                </Chip>
              )}
            </For>
            <Show when={types().includes("post")}>
              <Chip size="sm" selected={isShown("unlinked")} onClick={() => toggleShown("unlinked")}
                icon={<NodeShape type="post" style={{ opacity: 0.45 }} />}>
                {t("graph.unlinked_posts")}
              </Chip>
            </Show>
          </div>
        </Show>

        <TermGroup type="tag" label={t("graph.type_tag")} hint={t("graph.tags_hint")}
          terms={termCounts(all(), "tag")} />
        <TermGroup type="category" label={t("graph.type_category")} hint={t("graph.categories_hint")}
          terms={termCounts(all(), "category")} />

        <Show when={hasDrafts()}>
          <Heading>{t("graph.drafts")}</Heading>
          <Toggle label={t("graph.show_drafts")} checked={showDrafts()} onChange={toggleDrafts} />
        </Show>
      </div>
    </WidgetShell>
  );
}

// A switch for the whole group, then each term as a chip to hide it alone —
// folded away, since a channel can carry hundreds of tags.
function TermGroup(props: {
  type: "tag" | "category";
  label: string;
  hint: string;
  terms: ReturnType<typeof termCounts>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={props.terms.length}>
      <Heading>{props.label}</Heading>
      <Toggle
        label={<span class="flex items-center gap-2"><NodeShape type={props.type} />{t("graph.show_terms", { n: props.terms.length })}</span>}
        hint={props.hint}
        checked={isShown(props.type)}
        onChange={() => toggleShown(props.type)}
      />
      <Show when={isShown(props.type)}>
        <Collapsible
          open={open()}
          onOpenChange={setOpen}
          header={(trigger) => (
            <button type="button" {...trigger}
              class="flex w-full items-center gap-1 py-1 text-xs text-accent-txt hover:underline">
              <MdOutlineExpand_more size={16} class={`transition-transform motion-reduce:transition-none ${open() ? "rotate-180" : ""}`} />
              {t("graph.pick_terms")}
            </button>
          )}
        >
          <div class="flex flex-wrap gap-1.5 pt-1 max-h-48 overflow-y-auto" role="group" aria-label={props.label}>
            <For each={props.terms}>
              {(x) => (
                <Chip size="sm" selected={isShown(x.node.id)} count={x.count} onClick={() => toggleShown(x.node.id)}>
                  {x.node.title}
                </Chip>
              )}
            </For>
          </div>
        </Collapsible>
      </Show>
    </Show>
  );
}
