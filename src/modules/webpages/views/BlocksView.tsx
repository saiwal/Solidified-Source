// Block manager (/webpages/:nick/blocks) — list of the channel's item-backed
// content blocks (Hubzilla core's [block]name[/block] concept), used as
// presets by the HTML Block widget's dropdown. Standalone page, same
// structure as MenusView.tsx/LayoutTemplatesView.tsx (this is a secondary
// nested route, not the header/content-widget split the plain page list uses).

import { createEffect, For, Show } from "solid-js";
import { useParams, A, useNavigate } from "@solidjs/router";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useI18n } from "@utsukta/spa-core/i18n";
import { blocks, blocksLoading, loadBlocks, removeBlock } from "../store";
import type { Block } from "../api";
import {
  MdFillAdd, MdFillDelete, MdFillLock, MdFillLock_open, MdOutlineEdit_note,
  MdOutlineView_module,
} from "solid-icons/md";
import { IconButton } from "@ui/Button";
import PageActions from "@/shared/views/layout/PageActions";

function formatDate(s: string): string {
  if (!s) return "—";
  try {
    return new Date(s.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return s; }
}

function BlockRow(props: { block: Block; nick: string; onDelete: (iid: number) => void }) {
  const { t } = useI18n();
  return (
    <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg group transition-colors hover:bg-elevated">
      <MdOutlineView_module class="w-5 h-5 shrink-0 text-muted select-none" />

      <div class="flex-1 min-w-0">
        <span class="text-sm font-medium text-txt truncate block">
          {props.block.title || t("webpages.untitled")}
        </span>
        <span class="text-[0.6875rem] text-muted font-mono truncate block">{props.block.name}</span>
      </div>

      <span class={`hidden sm:flex items-center gap-1 text-xs shrink-0 ${
        props.block.is_private ? "text-accent" : "text-muted"
      }`}>
        <Show when={props.block.is_private} fallback={<MdFillLock_open size={11} />}>
          <MdFillLock size={11} />
        </Show>
        {props.block.is_private ? t("webpages.private_label") : t("webpages.public_label")}
      </span>

      <span class="hidden md:block text-xs text-muted w-28 text-right shrink-0">
        {formatDate(props.block.edited || props.block.created)}
      </span>

      <div class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
        <A
          href={`/webpages/${props.nick}/blocks/edit/${props.block.iid}`}
          class="p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors"
          title={t("webpages.edit") as string}
        >
          <MdOutlineEdit_note size={14} />
        </A>
        <IconButton
          label={t("webpages.delete") as string}
          variant="danger"
          size="sm"
          onClick={() => props.onDelete(props.block.iid)}
        >
          <MdFillDelete size={14} />
        </IconButton>
      </div>
    </div>
  );
}

export default function BlocksView() {
  const { t } = useI18n();
  const params = useParams<{ nick: string }>();
  const auth = useAuth();
  const navigate = useNavigate();

  const nick = () => params.nick || auth()?.nick || "";

  createEffect(() => {
    if ((auth as any).loading || !nick()) return;
    if (auth()?.nick !== nick()) navigate(`/page/${nick()}/home`, { replace: true });
  });

  createEffect(() => {
    if ((auth as any).loading || !nick()) return;
    loadBlocks(nick());
  });

  async function handleDelete(iid: number) {
    const block = blocks().find((b) => b.iid === iid);
    const label = block?.title || block?.name || t("webpages.untitled");
    if (!confirm(`${t("webpages.delete")} "${label}"?`)) return;
    await removeBlock(iid, nick());
  }

  return (
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-lg font-semibold text-txt">{t("webpages.manage_blocks")}</h1>
          <A href={`/webpages/${nick()}`} class="text-xs text-muted hover:text-accent transition-colors">
            {t("webpages.back")}
          </A>
        </div>
        <PageActions class="shrink-0" label={t("webpages.manage_blocks")} actions={[
          { label: t("webpages.new_block"), icon: MdFillAdd, href: `/webpages/${nick()}/blocks/new`, primary: true },
        ]} />
      </div>

      <div class="border-t border-rim" />

      <Show
        when={!blocksLoading()}
        fallback={
          <div class="space-y-1 animate-pulse">
            <For each={Array(3).fill(0)}>
              {() => (
                <div class="flex items-center gap-3 px-3 py-2.5">
                  <div class="w-5 h-5 rounded bg-overlay shrink-0" />
                  <div class="flex-1 space-y-1.5">
                    <div class="h-3.5 bg-overlay rounded w-48" />
                    <div class="h-2.5 bg-overlay rounded w-32" />
                  </div>
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show
          when={blocks().length > 0}
          fallback={
            <div class="py-16 flex flex-col items-center gap-4 text-center">
              <MdOutlineView_module class="w-10 h-10 text-muted" />
              <p class="text-sm text-muted">{t("webpages.no_blocks")}</p>
              <A
                href={`/webpages/${nick()}/blocks/new`}
                class="px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-sm hover:opacity-90 transition-opacity"
              >
                {t("webpages.create_first_block")}
              </A>
            </div>
          }
        >
          <div class="space-y-0.5">
            <For each={blocks()}>
              {(block) => <BlockRow block={block} nick={nick()} onDelete={handleDelete} />}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
