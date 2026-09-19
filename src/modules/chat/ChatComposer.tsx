// src/modules/chat/ChatComposer.tsx
import { createSignal, createEffect, Show, onCleanup, lazy } from "solid-js";
import { createComposerStore } from "@/shared/editor/store/createComposerStore";
import RichEditor from "@/shared/editor/core/RichEditor";
import { CAPABILITIES } from "@/shared/editor/types/editor.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { encryptBody } from "@utsukta/spa-core/lib/postCrypto";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import {
  useMention,
  getWysiwygMentionQuery,
  getCaretRect,
} from "@/shared/editor/mention/useMention";
import MentionPopup from "@/shared/editor/mention/MentionPopup";
import {
  useEmoji,
  getWysiwygEmojiQuery,
  type EmojiEntry,
} from "@/shared/editor/emoji/useEmoji";
import EmojiPopup from "@/shared/editor/emoji/EmojiPopup";
import EmojiPicker from "@/shared/editor/emoji/EmojiPicker";
import { emojiEntryToImg } from "@utsukta/spa-core/lib/emojify";
import { sendChatMessage, roomName, roomAcl } from "./store";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { uploadChatMedia } from "./chatAttach";
import { htmlToSource } from "@/shared/editor/core/htmlToSource";
import { MdFillSend, MdOutlineCamera_alt, MdOutlineEmoji_emotions, MdOutlineImage, MdOutlineLock, MdOutlineMic, MdOutlineVideocam } from "solid-icons/md";

const CameraCapture = lazy(() => import("@/shared/editor/attachments/CameraCapture"));

interface Props {
  nick: string;
  roomId: number;
}

export default function ChatComposer(props: Props) {
  const { t } = useI18n();
  const [tab, setTab] = createSignal<"wysiwyg" | "source">("wysiwyg");
  const [uploading, setUploading] = createSignal(false);
  const [uploadPct, setUploadPct] = createSignal(0);
  const [cameraOpen, setCameraOpen] = createSignal(false);

  // Session encrypt: password stored here, encrypts all outgoing messages until cleared.
  const [sessionPassword, setSessionPassword] = createSignal<string | null>(null);
  const [sessionHint, setSessionHint]         = createSignal("");
  const [sessionSetupOpen, setSessionSetupOpen] = createSignal(false);
  const [sessionPwInput, setSessionPwInput]     = createSignal("");
  const [sessionHintInput, setSessionHintInput] = createSignal("");
  const [sessionError, setSessionError]         = createSignal("");

  function enableSession() {
    const pw = sessionPwInput().trim();
    if (!pw) { setSessionError(t("editor.encrypt_error_no_password")); return; }
    setSessionPassword(pw);
    setSessionHint(sessionHintInput().trim());
    setSessionSetupOpen(false);
    setSessionError("");
    setSessionPwInput("");
    setSessionHintInput("");
  }

  function disableSession() {
    setSessionPassword(null);
    setSessionHint("");
    setSessionSetupOpen(false);
    setSessionError("");
  }

  const store = createComposerStore(
    async (body) => {
      const pw = sessionPassword();
      const msgBody = pw ? await encryptBody(body, pw, sessionHint()) : body;
      await sendChatMessage(props.nick, props.roomId, msgBody);
    },
    `chat:${props.nick}:${props.roomId}`,
  );

  const mention = useMention();
  const emoji = useEmoji();
  let wrapperRef: HTMLDivElement | undefined;
  let imgInput: HTMLInputElement | undefined;
  let videoInput: HTMLInputElement | undefined;
  let audioInput: HTMLInputElement | undefined;

  function getEditor(): HTMLDivElement | null {
    return wrapperRef?.querySelector("[contenteditable]") ?? null;
  }

  // Drive mention/emoji popups from body changes
  createEffect(() => {
    void store.body();
    const editor = getEditor();
    if (!editor) return;
    const mq = getWysiwygMentionQuery();
    if (mq !== null) { const r = getCaretRect(); if (r) { mention.openWithQuery(mq, r); emoji.close(); return; } }
    const eq = getWysiwygEmojiQuery();
    if (eq !== null) { const r = getCaretRect(); if (r) { emoji.openWithQuery(eq, r); mention.close(); return; } }
    mention.close();
    emoji.close();
  });

  function onKeyDown(e: KeyboardEvent) {
    if (mention.open()) {
      const consumed = mention.onKeyDown(e);
      if (consumed) {
        if (e.key === "Enter" || e.key === "Tab") {
          const entry = mention.filtered()[mention.activeIdx()];
          if (!entry) return;
          const editor = getEditor();
          if (editor) mention.insertWysiwyg(entry, () => store.setBody(htmlToSource(editor.innerHTML, store.mimetype())));
        }
        return;
      }
    }
    if (emoji.open()) {
      const consumed = emoji.onKeyDown(e);
      if (consumed) {
        if (e.key === "Enter" || e.key === "Tab") {
          const entry = emoji.filtered()[emoji.activeIdx()];
          if (!entry) return;
          const editor = getEditor();
          if (editor) emoji.insertWysiwyg(entry, () => store.setBody(htmlToSource(editor.innerHTML, store.mimetype())));
        }
        return;
      }
    }
  }

  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  function insertEmoji(entry: EmojiEntry) {
    const editor = getEditor();
    if (!editor) return;
    editor.focus();
    document.execCommand("insertHTML", false, `${emojiEntryToImg(entry)} `);
  }

  async function handleMediaFile(file: File) {
    const nick = currentNick();
    const room = roomName();
    if (!nick || !room) return;

    setUploading(true);
    setUploadPct(0);
    try {
      const media = await uploadChatMedia(nick, room, file, setUploadPct, roomAcl());
      // Append BBCode to the body; RichEditor effect will re-render the WYSIWYG surface
      store.setBody(store.body() ? `${store.body()}\n${media.bbcode}` : media.bbcode);
    } catch (e: any) {
      console.error("Chat media upload failed:", e);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  function pickFile(input: HTMLInputElement | undefined) {
    input?.click();
  }

  function onFileChange(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) void handleMediaFile(file);
    (e.currentTarget as HTMLInputElement).value = "";
  }

  return (
    <div class="px-4 py-3 border-t border-rim bg-surface shrink-0">
      {/* Hidden file inputs */}
      <input ref={imgInput}   type="file" accept="image/*"   class="hidden" onChange={onFileChange} />
      <input ref={videoInput} type="file" accept="video/*"   class="hidden" onChange={onFileChange} />
      <input ref={audioInput} type="file" accept="audio/*"   class="hidden" onChange={onFileChange} />

      <div ref={wrapperRef}>
        <RichEditor
          body={store.body()}
          onInput={store.setBody}
          capabilities={CAPABILITIES.chat}
          tab={tab()}
          onTabChange={setTab}
          onEnter={() => {
            if (mention.open() || emoji.open()) return false;
            store.submit();
            return true;
          }}
          onCtrlEnter={() => {
            if (!mention.open() && !emoji.open()) store.submit();
          }}
          placeholder={t("chat.write_message") as string}
          minHeight="60px"
        />
      </div>

      <Show when={store.error()}>
        <p class="text-xs text-red-500 mt-1">{store.error()}</p>
      </Show>

      {/* Session encrypt setup panel */}
      <Show when={isFeatureEnabled("content_encrypt") && sessionSetupOpen()}>
        <form
          class="mt-2 p-2.5 rounded-lg border border-rim bg-elevated/60 space-y-2"
          onSubmit={(e) => { e.preventDefault(); enableSession(); }}
        >
          <span class="block text-xs font-semibold text-muted uppercase tracking-wide">
            {t("editor.encrypt_panel_title")}
          </span>
          <div class="flex gap-2">
            <input
              type="password"
              placeholder={t("editor.encrypt_password_placeholder")}
              value={sessionPwInput()}
              onInput={(e) => setSessionPwInput(e.currentTarget.value)}
              class="flex-1 bg-transparent border border-rim rounded px-2 py-1 text-xs text-txt
                     placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
            />
            <input
              type="text"
              placeholder={t("editor.encrypt_hint_placeholder")}
              value={sessionHintInput()}
              onInput={(e) => setSessionHintInput(e.currentTarget.value)}
              class="flex-1 bg-transparent border border-rim rounded px-2 py-1 text-xs text-txt
                     placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
            />
          </div>
          <Show when={sessionError()}>
            <p class="text-red-400 text-xs">{sessionError()}</p>
          </Show>
          <div class="flex gap-2">
            <button type="submit"
              class="px-3 py-1 rounded-md text-xs font-semibold bg-accent text-accent-fg hover:opacity-90 transition-opacity">
              {t("editor.encrypt_btn")}
            </button>
            <button type="button"
              onClick={() => { setSessionSetupOpen(false); setSessionError(""); }}
              class="px-3 py-1 rounded-md text-xs text-muted hover:text-txt hover:bg-elevated transition-colors">
              {t("editor.encrypt_cancel")}
            </button>
          </div>
        </form>
      </Show>

      <div class="flex items-center justify-between mt-2 gap-2">
        {/* Left: media + emoji buttons */}
        <div class="flex items-center gap-0.5">
          <MediaBtn title="Image" onClick={() => pickFile(imgInput)} disabled={uploading()}>
            <MdOutlineImage class="text-lg" />
          </MediaBtn>
          <MediaBtn title="Video" onClick={() => pickFile(videoInput)} disabled={uploading()}>
            <MdOutlineVideocam class="text-lg" />
          </MediaBtn>
          <MediaBtn title="Audio" onClick={() => pickFile(audioInput)} disabled={uploading()}>
            <MdOutlineMic class="text-lg" />
          </MediaBtn>
          <MediaBtn title="Camera" onClick={() => setCameraOpen(true)} disabled={uploading()}>
            <MdOutlineCamera_alt class="text-lg" />
          </MediaBtn>
          <EmojiPicker
            onSelect={insertEmoji}
            triggerIcon={<MdOutlineEmoji_emotions class="text-lg" />}
            triggerClass="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-elevated transition-colors"
          />
          {/* Session encryption toggle */}
          <Show when={isFeatureEnabled("content_encrypt")}>
            <Show
              when={!sessionPassword()}
              fallback={
                /* Active: clicking disables session encryption */
                <button
                  type="button"
                  title="Session encrypted — click to disable"
                  onClick={disableSession}
                  class="p-1.5 rounded-lg text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors"
                >
                  <svg class="w-[1.125rem] h-[1.125rem]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </button>
              }
            >
              {/* Inactive: clicking opens setup */}
              <MediaBtn
                title={t("editor.encrypt_toggle")}
                onClick={() => setSessionSetupOpen((o) => !o)}
                disabled={false}
              >
                <MdOutlineLock class="w-[1.125rem] h-[1.125rem]" />
              </MediaBtn>
            </Show>
          </Show>

          {/* Upload progress */}
          <Show when={uploading()}>
            <div class="flex items-center gap-1.5 ml-2">
              <div class="w-20 h-1.5 bg-elevated rounded-full overflow-hidden">
                <div
                  class="h-full bg-accent rounded-full transition-all duration-150"
                  style={{ width: `${uploadPct()}%` }}
                />
              </div>
              <span class="text-[0.625rem] text-muted tabular-nums">{uploadPct()}%</span>
            </div>
          </Show>
        </div>

        {/* Right: send button */}
        <button
          type="button"
          onClick={() => store.submit()}
          disabled={store.submitting() || (!store.body().trim() && !uploading())}
          class="p-2 rounded-lg bg-accent text-accent-fg hover:opacity-90 disabled:opacity-40 transition-all shrink-0"
        >
          <MdFillSend class="text-base" />
        </button>
      </div>

      <Show when={mention.open() && mention.rect() !== null}>
        <MentionPopup
          query={mention.query()!}
          entries={mention.filtered()}
          anchorRect={mention.rect()!}
          activeIdx={mention.activeIdx()}
          onSelect={(entry) => {
            const editor = getEditor();
            if (editor) mention.insertWysiwyg(entry, () => store.setBody(htmlToSource(editor.innerHTML, store.mimetype())));
          }}
        />
      </Show>

      <Show when={emoji.open() && emoji.rect() !== null}>
        <EmojiPopup
          entries={emoji.filtered()}
          anchorRect={emoji.rect()!}
          activeIdx={emoji.activeIdx()}
          onSelect={(entry) => {
            const editor = getEditor();
            if (editor) { emoji.insertWysiwyg(entry, () => store.setBody(htmlToSource(editor.innerHTML, store.mimetype()))); emoji.close(); }
          }}
        />
      </Show>

      <Show when={cameraOpen()}>
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(files) => {
            setCameraOpen(false);
            if (files[0]) void handleMediaFile(files[0]);
          }}
        />
      </Show>
    </div>
  );
}

function MediaBtn(props: {
  title: string;
  onClick: () => void;
  disabled: boolean;
  children: any;
}) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled}
      class="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-elevated transition-colors disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
