import { Show, onCleanup } from "solid-js";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { createComposerStore } from "../store/createComposerStore";
import RichEditor from "../core/RichEditor";
import { CAPABILITIES } from "../types/editor.types";
import { useAuth, currentNick, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { MdOutlinePerson } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useMentionEmojiWiring } from "@/shared/editor/mention/useMentionEmojiWiring";
import MentionEmojiPopups from "@/shared/editor/mention/MentionEmojiPopups";
import AttachmentBar from "../attachments/AttachmentBar";
import { createAttachmentStore } from "../attachments/useAttachments";
import { bbcodeToInsert, patchInsertedAlt } from "../attachments/insertHelpers";
import SourceToggleButton from "../components/SourceToggleButton";
import { canUseWysiwyg } from "@utsukta/spa-core/lib/mimetypes";

interface Props {
  /** Parent item uuid — full-URL mids break the /spa/item/:id path (slashes). */
  parentUuid?: string;
  profileUid: number;
  initialBody?: string;
  onSubmitted?: (body: string) => void;
}

export default function CommentComposer(props: Props) {
  const { t } = useI18n();
  const auth = useAuth();
  const viewer = useNavViewer();
  const caps = CAPABILITIES.comment;

  const scope = `comment:${props.parentUuid ?? "new"}`;
  const attach = createAttachmentStore(currentNick(), scope);

  const store = createComposerStore(
    async (body) => {
      if (!props.parentUuid) throw new Error("Missing parent item");

      const fileTags = attach.attachments()
        .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
        .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
        .join("\n");
      const augmentedBody = fileTags ? `${body}\n${fileTags}` : body;

      const res = await apiFetch(
        `/spa/item/${encodeURIComponent(props.parentUuid)}/comment`,
        {
          method: "POST",
          body: JSON.stringify({ body: augmentedBody, mimetype: store.mimetype() }),
        },
      );
      if (!res.ok) throw new Error(`Comment failed: ${res.status}`);
      // The endpoint reports permission problems as { error } in a 200 body
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!json.success) throw new Error(json.error ?? "Comment failed");

      attach.clear();
      props.onSubmitted?.(body);
    },
    scope,
    {
      initialBody: props.initialBody,
      // Same "Markdown" feature as PostComposer (the mdpost addon's toggle);
      // the server converts to bbcode on save (ContentTypes::toBbcode).
      initialMimetype: isFeatureEnabled("markdown") ? "text/markdown" : "text/bbcode",
    },
  );

  // ── Mention + emoji autocomplete ─────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
  });

  window.addEventListener("keydown", wiring.onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", wiring.onKeyDown));

  if (!auth()?.isLoggedIn) return null;

  return (
    <div class="mt-3 space-y-2">
      <div class="flex gap-2 items-start">
        <Show when={auth()?.nick}>
          <Show
            when={viewer()?.avatar}
            fallback={
              <div class="w-7 h-7 rounded-full bg-accent-muted text-accent flex items-center justify-center shrink-0 mt-0.5">
                <MdOutlinePerson class="w-4 h-4" />
              </div>
            }
          >
            <img
              src={viewer()!.avatar}
              alt={viewer()!.name}
              class="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5 select-none"
              loading="lazy"
            />
          </Show>
        </Show>

        <div ref={wiring.wrapperRef} class="flex-1 min-w-0">
          <RichEditor
            onImageAlt={(src, alt) => attach.setAltByUrl(src, alt)}
            body={store.body()}
            onInput={store.setBody}
            mimetype={store.mimetype()}
            capabilities={caps}
            tab={store.tab()}
            onTabChange={store.setTab}
            onCtrlEnter={() => {
              if (!wiring.mention.open()) store.submit();
            }}
            onPasteFiles={auth()?.isLocal ? (files) => attach.addUploads(files) : undefined}
            placeholder={t("editor.write_reply_ctrl")}
            minHeight="44px"
            resizable
          />
          {/* Attachment uploads go through wall_attach/:nick — remote/OWA
              commenters have no local nick on this server to upload against,
              so they only get the source toggle without the rest of the bar. */}
          <Show
            when={auth()?.isLocal}
            fallback={
              <div class="flex justify-end mt-1">
                <SourceToggleButton
                  tab={store.tab()}
                  onToggle={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
                  canWysiwyg={canUseWysiwyg(store.mimetype(), caps.markdownWysiwyg)}
                />
              </div>
            }
          >
            <AttachmentBar
              store={attach}
              nick={currentNick()}
              accept="both"
              onInsert={(bbcode) => {
                store.setBody(store.body() + "\n" + bbcodeToInsert(bbcode, store.mimetype()));
              }}
              onAltChange={(att) => {
                store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
              }}
              tab={store.tab()}
              onToggleTab={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
              canWysiwyg={canUseWysiwyg(store.mimetype(), caps.markdownWysiwyg)}
            />
          </Show>
        </div>
      </div>


      <div class="flex justify-end gap-2 pl-9">
        <Show when={store.body().trim()}>
          <button
            type="button"
            onClick={store.reset}
            class="px-3 py-1 text-xs rounded-lg border border-rim text-muted hover:bg-elevated transition-colors"
          >
            {t("editor.cancel_btn")}
          </button>
        </Show>
        <button
          type="button"
          onClick={() => store.submit()}
          disabled={store.submitting() || attach.uploading() || !store.body().trim()}
          class="px-3 py-1 text-xs font-medium rounded-lg bg-accent text-accent-fg
                 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {store.submitting() ? t("editor.sending") : t("editor.reply_btn")}
        </button>
      </div>

      <MentionEmojiPopups wiring={wiring} />
    </div>
  );
}
