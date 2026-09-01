import { createResource, Show } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import BlockComposer from "@/shared/editor/composers/BlockComposer";
import { fetchBlockByIid } from "../api";
import { loadBlocks } from "../store";

export default function BlockEditorView() {
  const { t } = useI18n();
  const params = useParams<{ nick: string; iid?: string }>();
  const navigate = useNavigate();

  const nick = () => params.nick;
  const iid = () => (params.iid ? parseInt(params.iid, 10) : null);
  const isEditing = () => iid() !== null;

  const [block] = createResource(
    () => (isEditing() ? { nick: nick(), iid: iid()! } : null),
    ({ nick, iid }) => fetchBlockByIid(nick, iid),
  );

  const onSaved = () => { void loadBlocks(nick(), true); navigate(`/webpages/${nick()}/blocks`); };
  const onCancel = () => navigate(`/webpages/${nick()}/blocks`);

  return (
    <div class="max-w-3xl mx-auto flex flex-col gap-4">
      {/* Breadcrumb */}
      <div class="flex items-center gap-2 text-sm text-muted">
        <A
          href={`/webpages/${nick()}/blocks`}
          class="hover:text-txt transition-colors"
        >
          {t("webpages.back")}
        </A>
        <span>/</span>
        <span>{isEditing() ? t("webpages.edit_block_title") : t("webpages.new_block_title")}</span>
      </div>

      {/* Loading skeleton */}
      <Show when={block.loading}>
        <div class="space-y-4 p-4 animate-pulse">
          <div class="h-8 bg-elevated rounded w-1/2" />
          <div class="h-4 bg-elevated rounded w-1/4" />
          <div class="h-64 bg-elevated rounded" />
        </div>
      </Show>

      {/* Error */}
      <Show when={block.error}>
        <div class="m-4 p-4 rounded-xl border border-red-300 bg-red-50 text-red-700 text-sm">
          {block.error?.message ?? t("webpages.load_failed")}
        </div>
      </Show>

      {/* Create mode */}
      <Show when={!isEditing() && !block.loading}>
        <BlockComposer
          nick={nick()}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      </Show>

      {/* Edit mode */}
      <Show when={isEditing() && !block.loading && block()}>
        <BlockComposer
          nick={nick()}
          initial={{
            uuid:          block()!.uuid,
            mid:           block()!.mid,
            title:         block()!.title,
            name:          block()!.name,
            body:          block()!.body,
            mimetype:      block()!.mimetype,
            item_private:  block()!.item_private,
            public_policy: block()!.public_policy,
            allow_cid:     block()!.allow_cid,
            allow_gid:     block()!.allow_gid,
            deny_cid:      block()!.deny_cid,
            deny_gid:      block()!.deny_gid,
          }}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      </Show>
    </div>
  );
}
