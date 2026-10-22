// src/modules/chat/ChatComposer.tsx
// The chat input: rich editor, "Aa" formatting toolbar, emoji, mentions.
// Shared by chatrooms and Messenger's DMs, so what it sends to, and whether
// it uploads or encrypts, comes from the caller.
import { createEffect, createSignal, Show, onCleanup, lazy } from "solid-js";
import { createComposerStore } from "@/shared/editor/store/createComposerStore";
import RichEditor from "@/shared/editor/core/RichEditor";
import { CAPABILITIES } from "@/shared/editor/types/editor.types";
import { useI18n } from "@utsukta/spa-core/i18n";
import type { MimeType } from "@utsukta/spa-core/lib/mimetypes";
import { encryptBody } from "@utsukta/spa-core/lib/postCrypto";
import { isFeatureEnabled, currentNick } from "@utsukta/spa-core/store/auth-store";
import { useMentionEmojiWiring } from "@/shared/editor/mention/useMentionEmojiWiring";
import MentionEmojiPopups from "@/shared/editor/mention/MentionEmojiPopups";
import type { AttachmentActions } from "@/shared/editor/attachments/useAttachmentActions";
import { appendInsert, bbcodeToInsert } from "@/shared/editor/attachments/insertHelpers";
import { MdFillSend, MdOutlineAttach_file, MdOutlineLock } from "solid-icons/md";
import EmojiPicker from "@/shared/editor/emoji/EmojiPicker";
import SourceToggleButton from "@/shared/editor/components/SourceToggleButton";
import { emojiEntryToImg } from "@utsukta/spa-core/lib/emojify";
import type { EmojiEntry } from "@utsukta/spa-core/store/emoji-store";
import { IconButton, SplitSubmitButton } from "@/shared/editor/components/buttons";

const CameraCapture = lazy(() => import("@/shared/editor/attachments/CameraCapture"));
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { createPopover } from "@utsukta/spa-core/lib/createPopover";
import { Button, IconButton as UiIconButton } from "@ui/Button";
import { Input } from "@ui/Field";
const FilePickerModal = lazy(() => import("@/shared/editor/attachments/picker/FilePickerModal"));

interface Props {
  /** Send one message; throw to keep the text and show the error. */
  send: (body: string, mimetype: MimeType) => Promise<void>;
  /** Draft scope key. */
  scope: string;
  placeholder?: string;
  /** Upload one file, returning the bbcode to insert. Omit for no attachments
   *  (a room upload takes its ACL; a DM relies on core narrowing it on send). */
  upload?: (file: File, onPct: (pct: number) => void) => Promise<string>;
  /** Offer session encryption — only where the reader can decrypt (rooms). */
  encrypt?: boolean;
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
      if (pw) await props.send(await encryptBody(body, pw, sessionHint()), "text/bbcode");
      else await props.send(body, store.mimetype());
    },
    props.scope,
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

  // Uploads go through the caller (a room's own folder and ACL), not the post
  // AttachmentStore, whose files take the channel's default ACL.
  async function uploadFiles(files: File[]) {
    const upload = props.upload;
    if (!upload || !files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        setUploadPct(0);
        insert(await upload(file, setUploadPct));
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
    canBrowse: true,
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
          attach={props.upload ? attach : undefined}
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
          placeholder={props.placeholder ?? (t("chat.write_message") as string)}
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
          <Show when={props.upload}>
            <IconButton title={t("editor.attach_file_title")} onClick={() => attach.openFile()}>
              <MdOutlineAttach_file class="w-4 h-4" />
            </IconButton>
          </Show>
          <EmojiPicker onSelect={insertEmoji} />
          <Button
            variant="ghost"
            size="sm"
            pressed={formatting()}
            title={t("editor.more_tools")}
            onClick={() => setFormatting(!formatting())}
          >
            Aa
          </Button>
          <Show when={props.encrypt && isFeatureEnabled("content_encrypt")}>
            <UiIconButton
              label={sessionPassword() ? t("chat.session_encrypted") : t("editor.encrypt_toggle")}
              size="sm"
              pressed={!!sessionPassword()}
              ref={encPop.ref}
              aria-haspopup="dialog"
              aria-expanded={sessionSetupOpen()}
              onClick={() => setSessionSetupOpen(!sessionSetupOpen())}
            >
              <MdOutlineLock class="w-4 h-4" />
            </UiIconButton>
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
        <p class="text-xs text-danger-txt mt-1">{store.error()}</p>
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
                  <Button variant="ghost" size="sm" onClick={() => setSessionSetupOpen(false)}>
                    {t("editor.encrypt_cancel")}
                  </Button>
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
                <Input
                  class="w-full"
                  ref={pwInput}
                  type="password"
                  placeholder={t("editor.encrypt_password_placeholder")}
                  value={sessionPwInput()}
                  onInput={(e) => setSessionPwInput(e.currentTarget.value)}
                />
                <Input
                  class="w-full"
                  type="text"
                  placeholder={t("editor.encrypt_hint_placeholder")}
                  value={sessionHintInput()}
                  onInput={(e) => setSessionHintInput(e.currentTarget.value)}
                />
                <Show when={sessionError()}>
                  <p class="text-danger-txt text-xs">{sessionError()}</p>
                </Show>
                <div class="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSessionSetupOpen(false); setSessionError(""); }}
                  >
                    {t("editor.encrypt_cancel")}
                  </Button>
                  <Button size="sm" type="submit">
                    {t("editor.encrypt_btn")}
                  </Button>
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
