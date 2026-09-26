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
import { useAttachmentActions } from "../attachments/useAttachmentActions";
import { bbcodeToInsert, patchInsertedAlt, missingVideoEmbeds, patchInsertedPoster, appendInsert } from "../attachments/insertHelpers";

/** Ids of the stored comment — lets the optimistic node be replied to. */
export interface CreatedComment { iid: number; mid: string; uuid: string }

interface Props {
  /** Parent item uuid — full-URL mids break the /spa/item/:id path (slashes). */
  parentUuid?: string;
  profileUid: number;
  initialBody?: string;
  onSubmitted?: (body: string, created?: CreatedComment) => void;
}

export default function CommentComposer(props: Props) {
  const { t } = useI18n();
  const auth = useAuth();
  const viewer = useNavViewer();
  const caps = CAPABILITIES.comment;

  const scope = `comment:${props.parentUuid ?? "new"}`;
  const attach = createAttachmentStore(currentNick(), scope);
  // Owned here so the editor toolbar and the attachment bar drive the same
  // upload/browse/camera flows (the buttons live in the toolbar now).
  const attachActions = useAttachmentActions(() => attach, currentNick, () => "both");

  const store = createComposerStore(
    async (body) => {
      if (!props.parentUuid) throw new Error("Missing parent item");

      const fileTags = attach.attachments()
        .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
        .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
        .join("\n");
      // Videos never Inserted still get a player (and their poster), not
      // just a file chip. The [attachment] tag stays: it's what makes core
      // fix the video's ACL and federate it as an AP attachment.
      const videoTags = missingVideoEmbeds(body, attach.attachments(), attach.insertBBCode);
      const augmentedBody = [body, videoTags && bbcodeToInsert(videoTags, store.mimetype()), fileTags]
        .filter(Boolean).join("\n");

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
      } & Partial<CreatedComment>;
      if (!json.success) throw new Error(json.error ?? "Comment failed");

      attach.clear();
      props.onSubmitted?.(
        body,
        json.iid && json.uuid ? { iid: json.iid, mid: json.mid ?? "", uuid: json.uuid } : undefined,
      );
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
              <div class="w-7 h-7 rounded-full bg-accent-muted text-accent hidden sm:flex items-center justify-center shrink-0 mt-0.5">
                <MdOutlinePerson class="w-4 h-4" />
              </div>
            }
          >
            <img
              src={viewer()!.avatar}
              alt={viewer()!.name}
              class="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5 select-none hidden sm:block"
              loading="lazy"
            />
          </Show>
        </Show>

        <div ref={wiring.wrapperRef} class="flex-1 min-w-0">
          <RichEditor
            attach={auth()?.isLocal ? attachActions : undefined}
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
            minHeight="88px"
            resizable
          />
          {/* Same row every composer uses: counts plus the borderless source
              toggle. Shown for every commenter — a remote/OWA one cannot
              upload, but can still switch to source and count their words. */}

          {/* Uploads go through wall_attach/:nick, so a remote/OWA commenter
              has no local nick to upload against and gets no bar at all. */}
          <Show when={auth()?.isLocal}>
            <AttachmentBar
              store={attach}
              actions={attachActions}
              nick={currentNick()}
              accept="both"
              onInsert={(bbcode) => {
                store.setBody(appendInsert(store.body(), bbcodeToInsert(bbcode, store.mimetype())));
              }}
              onAltChange={(att) => {
                store.setBody(patchInsertedAlt(store.body(), att, store.mimetype()));
              }}
              onPosterChange={(att) => store.setBody(patchInsertedPoster(store.body(), att))}
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
