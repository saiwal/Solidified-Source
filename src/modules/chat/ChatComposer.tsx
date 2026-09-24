// src/modules/chat/ChatComposer.tsx
import { createEffect, createSignal, Show, onCleanup, lazy } from "solid-js";
import { createComposerStore } from "@/shared/editor/store/createComposerStore";
import RichEditor from "@/shared/editor/core/RichEditor";
import { CAPABILITIES } from "@/shared/editor/types/editor.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { encryptBody } from "@utsukta/spa-core/lib/postCrypto";
import { isFeatureEnabled, currentNick } from "@utsukta/spa-core/store/auth-store";
import { useMentionEmojiWiring } from "@/shared/editor/mention/useMentionEmojiWiring";
import MentionEmojiPopups from "@/shared/editor/mention/MentionEmojiPopups";
import type { AttachmentActions } from "@/shared/editor/attachments/useAttachmentActions";
import { appendInsert, bbcodeToInsert } from "@/shared/editor/attachments/insertHelpers";
import type { RoomSession } from "./store";
import { uploadChatMedia } from "./chatAttach";
import { MdFillSend, MdOutlineAttach_file, MdOutlineLock } from "solid-icons/md";
import EmojiPicker from "@/shared/editor/emoji/EmojiPicker";
import SourceToggleButton from "@/shared/editor/components/SourceToggleButton";
import { emojiEntryToImg } from "@utsukta/spa-core/lib/emojify";
import type { EmojiEntry } from "@utsukta/spa-core/store/emoji-store";
import { IconButton, SplitSubmitButton } from "@/shared/editor/components/buttons";

const CameraCapture = lazy(() => import("@/shared/editor/attachments/CameraCapture"));
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { createPopover } from "@/shared/stream/filters/createPopover";
const FilePickerModal = lazy(() => import("@/shared/editor/attachments/picker/FilePickerModal"));

interface Props {
  room: RoomSession;
}

export default function ChatComposer(props: Props) {
  const { t } = useI18n();
  const [uploading, setUploading] = createSignal(false);
  const [uploadPct, setUploadPct] = createSignal(0);
  const [cameraOpen, setCameraOpen] = createSignal(false);
  const [pickerOpen, setPickerOpen] = createSignal(false);
  // The full formatting toolbar, folded behind "Aa" so a chat input stays one
  // slim row until you want it.
  const [formatting, setFormatting] = createSignal(false);

  // Session encrypt: password stored here, encrypts all outgoing messages until cleared.
  const [sessionPassword, setSessionPassword] = createSignal<string | null>(null);
  const [sessionHint, setSessionHint]         = createSignal("");
  // Anchored above the lock icon; floating-ui flips it if there is no room.
  const encPop = createPopover({ placement: "top-start" });
  const sessionSetupOpen = encPop.open;
  const setSessionSetupOpen = encPop.setOpen;
  let pwInput: HTMLInputElement | undefined;
  // The panel stays visibility:hidden until floating-ui has placed it, and a
  // hidden input can't take focus — so focus once it is actually shown.
  createEffect(() => {
    if (encPop.style().visibility === "visible") pwInput?.focus();
  });
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
      // An encrypted message is a [crypt] block, i.e. bbcode, whatever it was
      // typed in; plain ones go up in their own format and the server
      // converts Markdown to bbcode, exactly as for posts.
      if (pw) await props.room.send(await encryptBody(body, pw, sessionHint()), "text/bbcode");
      else await props.room.send(body, store.mimetype());
    },
    `chat:${props.room.nick}:${props.room.roomId}`,
    // Same "Markdown" feature toggle as PostComposer/CommentComposer.
    { initialMimetype: isFeatureEnabled("markdown") ? "text/markdown" : "text/bbcode" },
  );

  const wiring = useMentionEmojiWiring({
    body: store.body,
    setBody: store.setBody,
    mimetype: store.mimetype,
  });
  window.addEventListener("keydown", wiring.onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", wiring.onKeyDown));

  const insert = (bbcode: string) =>
    store.setBody(appendInsert(store.body(), bbcodeToInsert(bbcode, store.mimetype())));

  // Uploads go into the room's own cloud folder under the room ACL
  // (uploadChatMedia), not through the post AttachmentStore, whose files take
  // the channel's default ACL — so the toolbar gets a chat-specific adapter.
  async function uploadFiles(files: File[]) {
    const nick = currentNick();
    const room = props.room.name();
    if (!nick || !room || !files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        setUploadPct(0);
        insert((await uploadChatMedia(nick, room, file, setUploadPct, props.room.acl())).bbcode);
      }
    } catch (e) {
      console.error("Chat media upload failed:", e);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  // The slim row's emoji picker; the toolbar's own one is hidden with it.
  function insertEmoji(entry: EmojiEntry) {
    if (store.tab() === "source") {
      store.setBody(`${store.body()}${entry.shortname} `);
      return;
    }
    const el = box?.querySelector<HTMLElement>("[contenteditable]");
    if (!el) return;
    el.focus();
    // execCommand fires the surface's input event, which syncs the body.
    document.execCommand("insertHTML", false, `${emojiEntryToImg(entry)} `);
  }

  let fileInput: HTMLInputElement | undefined;
  let box: HTMLDivElement | undefined;
  const attach: AttachmentActions = {
    openFile: () => fileInput?.click(),
    openBrowse: () => setPickerOpen(true),
    openCamera: () => setCameraOpen(true),
    addFiles: (files) => void uploadFiles(Array.from(files ?? [])),
    surfaces: () => null,
  };

  return (
    <div class="px-3 pb-3 pt-1 shrink-0">
      <input
        ref={fileInput}
        type="file"
        multiple
        class="hidden"
        onChange={(e) => {
          attach.addFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />

      {/* One rounded input box: typing surface with Send beside it, the full
          formatting toolbar when "Aa" is on, then a slim action row (attach,
          emoji, Aa, session encryption, source). */}
      <div
        ref={(el) => { box = el; wiring.wrapperRef(el); }}
        class="rounded-2xl border border-rim bg-elevated focus-within:border-rim-strong transition-colors"
      >
        <RichEditor
          attach={attach}
          body={store.body()}
          onInput={store.setBody}
          mimetype={store.mimetype()}
          capabilities={{ ...CAPABILITIES.chat, toolbar: formatting() ? "full" : "none" }}
          hideStats
          tab={store.tab()}
          onTabChange={store.setTab}
          onEnter={() => {
            if (wiring.mention.open() || wiring.emoji.open()) return false;
            store.submit();
            return true;
          }}
          onCtrlEnter={() => {
            if (!wiring.mention.open() && !wiring.emoji.open()) store.submit();
          }}
          onPasteFiles={(files) => void uploadFiles(files)}
          placeholder={t("chat.write_message") as string}
          minHeight="2.5rem"
          maxHeight="10rem"
          surfaceTrailing={
            <SplitSubmitButton
              icon
              onClick={() => store.submit()}
              disabled={store.submitting() || uploading() || !store.body().trim()}
            >
              {/* The lock rides on the button while a session password is set, so
                  it's clear every message is going out encrypted. */}
              <span class="flex items-center gap-1" title={t("editor.send_btn") as string}>
                <Show when={sessionPassword()}>
                  <MdOutlineLock class="w-3.5 h-3.5" />
                </Show>
                <MdFillSend class="w-4 h-4" />
              </span>
            </SplitSubmitButton>
          }
        />
        <div class="flex items-center gap-0.5 px-2 pb-1.5">
          <IconButton title={t("editor.attach_file_title")} onClick={() => attach.openFile()}>
            <MdOutlineAttach_file class="w-4 h-4" />
          </IconButton>
          <EmojiPicker onSelect={insertEmoji} />
          <button
            type="button"
            title={t("editor.more_tools")}
            aria-pressed={formatting()}
            onClick={() => setFormatting(!formatting())}
            class="px-1.5 py-1 rounded-md text-xs font-semibold transition-colors"
            classList={{
              "text-accent bg-accent/10": formatting(),
              "text-muted hover:text-txt hover:bg-overlay": !formatting(),
            }}
          >
            Aa
          </button>
          <Show when={isFeatureEnabled("content_encrypt")}>
            <button
              ref={encPop.ref}
              type="button"
              title={sessionPassword() ? t("chat.session_encrypted") : t("editor.encrypt_toggle")}
              aria-haspopup="dialog"
              aria-expanded={sessionSetupOpen()}
              onClick={() => setSessionSetupOpen(!sessionSetupOpen())}
              class="p-1.5 rounded-md transition-colors"
              classList={{
                "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20": !!sessionPassword(),
                "text-muted hover:text-txt hover:bg-elevated": !sessionPassword(),
              }}
            >
              <MdOutlineLock class="w-4 h-4" />
            </button>
          </Show>
          <SourceToggleButton
            tab={store.tab()}
            onToggle={() => store.setTab(store.tab() === "wysiwyg" ? "source" : "wysiwyg")}
            borderless
          />
          <Show when={uploading()}>
            <div class="ml-auto flex items-center gap-1.5" role="status">
              <div class="w-16 h-1 bg-surface rounded-full overflow-hidden">
                <div class="h-full bg-accent rounded-full transition-all duration-150" style={{ width: `${uploadPct()}%` }} />
              </div>
              <span class="text-[0.625rem] text-muted tabular-nums">{uploadPct()}%</span>
            </div>
          </Show>
        </div>
      </div>

      <Show when={store.error()}>
        <p class="text-xs text-red-500 mt-1">{store.error()}</p>
      </Show>

      {/* Session encryption — set a password once and every message you send
          from this window goes out encrypted until you turn it off. */}
      <Show when={isFeatureEnabled("content_encrypt") && sessionSetupOpen()}>
        <Portal mount={topLayer()}>
          <div
            ref={encPop.floating}
            style={encPop.style()}
            role="dialog"
            aria-label={t("editor.encrypt_panel_title")}
            class="z-[60] w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-rim bg-surface shadow-xl p-3 space-y-3"
            // Handled here and stopped: the chat window minimizes on a
            // document-level Escape when docked, and closing this popup
            // shouldn't take the window with it.
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              e.stopPropagation();
              setSessionSetupOpen(false);
              setSessionError("");
            }}
          >
            <h2 class="text-sm font-semibold text-txt">
              {sessionPassword() ? t("chat.session_encrypted") : t("editor.encrypt_panel_title")}
            </h2>
            <Show
              when={!sessionPassword()}
              fallback={
                <div class="flex justify-end gap-2">
                  <button type="button"
                    onClick={() => setSessionSetupOpen(false)}
                    class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-txt hover:bg-elevated transition-colors">
                    {t("editor.encrypt_cancel")}
                  </button>
                  <button type="button"
                    onClick={disableSession}
                    class="px-3 py-1.5 rounded-lg text-sm font-semibold text-yellow-600 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors">
                    {t("chat.session_encrypt_disable")}
                  </button>
                </div>
              }
            >
              <form
                class="space-y-3"
                onSubmit={(e) => { e.preventDefault(); enableSession(); }}
              >
                <input
                  ref={pwInput}
                  type="password"
                  placeholder={t("editor.encrypt_password_placeholder")}
                  value={sessionPwInput()}
                  onInput={(e) => setSessionPwInput(e.currentTarget.value)}
                  class="w-full bg-elevated border border-rim rounded-lg px-2.5 py-1.5 text-sm text-txt
                         placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
                />
                <input
                  type="text"
                  placeholder={t("editor.encrypt_hint_placeholder")}
                  value={sessionHintInput()}
                  onInput={(e) => setSessionHintInput(e.currentTarget.value)}
                  class="w-full bg-elevated border border-rim rounded-lg px-2.5 py-1.5 text-sm text-txt
                         placeholder:text-muted outline-none focus:border-rim-strong transition-colors"
                />
                <Show when={sessionError()}>
                  <p class="text-red-400 text-xs">{sessionError()}</p>
                </Show>
                <div class="flex justify-end gap-2">
                  <button type="button"
                    onClick={() => { setSessionSetupOpen(false); setSessionError(""); }}
                    class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-txt hover:bg-elevated transition-colors">
                    {t("editor.encrypt_cancel")}
                  </button>
                  <button type="submit"
                    class="px-3 py-1.5 rounded-lg text-sm font-semibold bg-accent text-accent-fg hover:opacity-90 transition-opacity">
                    {t("editor.encrypt_btn")}
                  </button>
                </div>
              </form>
            </Show>
          </div>
        </Portal>
      </Show>

      <MentionEmojiPopups wiring={wiring} />

      <Show when={cameraOpen()}>
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(files) => {
            setCameraOpen(false);
            void uploadFiles(files);
          }}
        />
      </Show>

      {/* Existing cloud files and photos keep their own permissions — only
          fresh uploads get the room ACL. */}
      <Show when={pickerOpen()}>
        <FilePickerModal
          nick={currentNick()}
          accept="both"
          onClose={() => setPickerOpen(false)}
          onSelectFiles={(files) => {
            setPickerOpen(false);
            for (const f of files) {
              insert(
                f.is_photo
                  ? `[img]${window.location.origin}/photo/${f.hash}-1[/img]`
                  : `[url=${window.location.origin}/cloud/${currentNick()}/${f.display_path
                      .split("/").map(encodeURIComponent).join("/")}]${f.filename}[/url]`,
              );
            }
          }}
          onSelectPhotos={(photos) => {
            setPickerOpen(false);
            for (const p of photos) insert(`[zrl=${p.link}][zmg]${p.src}[/zmg][/zrl]`);
          }}
        />
      </Show>
    </div>
  );
}
