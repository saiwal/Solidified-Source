import { createSignal, createEffect, onCleanup, Show } from "solid-js";
import { BiRegularEraser } from "solid-icons/bi";
import { MdOutlineOpen_in_full, MdOutlinePerson } from "solid-icons/md";
import { toast } from "@utsukta/spa-core/store/toast";
import { useAuth, currentNick } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { motion } from "solid-motionone";
import { openComposer } from "@/shared/editor/store/composer-host";
import RichEditor from "@/shared/editor/core/RichEditor";
import { createAttachmentStore } from "@/shared/editor/attachments/useAttachments";
import { bbcodeToInsert, appendInsert } from "@/shared/editor/attachments/insertHelpers";
import { CAPABILITIES, type EditorTab } from "@/shared/editor/types/editor.types";
import AclPicker, { entryKey, type AclMode, type AclEntry } from "@/shared/editor/components/AclPicker";
import { storageGet, storageSet, storageDel } from "@utsukta/spa-core/lib/storage";
import { apiError } from "@utsukta/spa-core/lib/fetch";
import { getCsrfToken } from "@utsukta/spa-core/lib/csrf";
import { useMentionEmojiWiring } from "@/shared/editor/mention/useMentionEmojiWiring";
import MentionEmojiPopups from "@/shared/editor/mention/MentionEmojiPopups";
import { useI18n } from "@utsukta/spa-core/i18n";
void motion;

const DRAFT_KEY = "hz_hq_draft";
const MIME = "text/bbcode";
// Same surface and attachment pipeline as every other composer — this bar used
// to hand-roll its own contenteditable, which is where its base64 image paste
// and its dead link button came from. The "quick" toolbar level keeps that to
// one row.
const CAPS = CAPABILITIES.quick;

export default function HqComposerSlot() {
  const auth = useAuth();
  return (
    <Show when={!auth.loading && auth()?.isLocal}>
      <HqComposer />
    </Show>
  );
}

function HqComposer() {
  const { t } = useI18n();
  const auth = useAuth();
  const viewer = useNavViewer();
  const [body, setBody] = createSignal("");
  const [aclMode, setAclMode] = createSignal<AclMode>("connections");
  const [allowKeys, setAllowKeys] = createSignal<Set<string>>(new Set<string>());
  const [denyKeys, setDenyKeys] = createSignal<Set<string>>(new Set<string>());
  const [submitting, setSubmitting] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [tab, setTab] = createSignal<EditorTab>("wysiwyg");

  const attach = createAttachmentStore(currentNick(), "hq:quick");

  // No AttachmentBar here — the bar is where an upload is normally inserted by
  // hand, so without it a pasted image would upload and then sit invisible.
  // Insert each image as soon as it's ready instead; files that aren't images
  // have no inline form and ride along as [attachment] tags at submit time.
  const inserted = new Set<string>();
  createEffect(() => {
    for (const a of attach.attachments()) {
      if (a.status !== "ready" || !a.isImage || inserted.has(a.id)) continue;
      inserted.add(a.id);
      setBody(appendInsert(body(), bbcodeToInsert(attach.insertBBCode(a.id), MIME)));
    }
  });

  // Load draft on mount
  storageGet<{ body?: string; aclMode?: string }>(DRAFT_KEY, {}).then((d) => {
    if (d.body && !body()) {
      setBody(d.body);
      setExpanded(true);
    }
    if (d.aclMode) setAclMode((d.aclMode as AclMode) ?? "connections");
  });

  // Auto-save draft
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const snap = { body: body(), aclMode: aclMode() };
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => storageSet(DRAFT_KEY, snap), 800);
  });
  onCleanup(() => clearTimeout(draftTimer));

  // ── Mention + emoji autocomplete ──────────────────────────────────────────
  const wiring = useMentionEmojiWiring({
    body,
    setBody,
    mimetype: () => MIME,
    tags: { channelNick: () => auth()?.nick ?? "", type: () => "posts" },
  });

  function onKeyDown(e: KeyboardEvent) {
    wiring.onKeyDown(e);
  }

  window.addEventListener("keydown", onKeyDown);
  onCleanup(() => window.removeEventListener("keydown", onKeyDown));

  let bodyEl: HTMLDivElement | undefined;

  function expandAndFocus() {
    setExpanded(true);
    // RichEditor owns its surface and exposes no ref; the contenteditable is
    // the only focusable thing it renders inside this wrapper.
    requestAnimationFrame(() =>
      bodyEl?.querySelector<HTMLElement>("[contenteditable]")?.focus(),
    );
  }

  function toggleEntry(entry: AclEntry, list: "allow" | "deny") {
    const key = entryKey(entry);
    if (list === "allow") {
      setAllowKeys((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
      setDenyKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    } else {
      setDenyKeys((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
      setAllowKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
    }
  }

  async function handleSubmit() {
    if (!body().trim()) return;
    setSubmitting(true);

    // Images are already inline in the body ([zmg]/[img] from the bar's
    // onInsert); everything else rides as an [attachment] tag, which Item.php
    // strips back out into item.attach.
    const fileTags = attach.attachments()
      .filter((a) => a.status === "ready" && !a.isImage && (a.hash || a.resourceId))
      .map((a) => `[attachment]${a.hash ?? a.resourceId},0[/attachment]`)
      .join("\n");

    const mode = aclMode();
    const payload: Record<string, unknown> = {
      body: fileTags ? `${body()}\n${fileTags}` : body(),
      mimetype: MIME,
      profile_uid: auth()!.uid,
    };

    if (mode === "public") {
      payload.scope = "public";
    } else if (mode === "connections") {
      payload.scope = "contacts";
    } else if (mode === "me") {
      payload.scope = "private";
    } else {
      if (allowKeys().size === 0) {
        toast.error("Select at least one connection to allow.");
        setSubmitting(false);
        return;
      }
      payload.scope = "custom";
      const contactAllow: string[] = [];
      const groupAllow: string[] = [];
      const contactDeny: string[] = [];
      const groupDeny: string[] = [];
      for (const key of allowKeys()) {
        const [type, ...rest] = key.split(":");
        const xid = rest.join(":");
        if (type === "c") contactAllow.push(xid);
        if (type === "g") groupAllow.push(xid);
      }
      for (const key of denyKeys()) {
        const [type, ...rest] = key.split(":");
        const xid = rest.join(":");
        if (type === "c") contactDeny.push(xid);
        if (type === "g") groupDeny.push(xid);
      }
      payload.contact_allow = contactAllow;
      payload.group_allow = groupAllow;
      payload.contact_deny = contactDeny;
      payload.group_deny = groupDeny;
    }

    try {
      const csrf = await getCsrfToken();
      const res = await fetch("/spa/item", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await apiError(res);
      const json = await res.json().catch(() => ({})) as { data?: { post?: unknown } };
      if (!json.data?.post) { toast.error("Server reported failure."); return; }
      toast.success(t("editor.post_published"));
      resetComposer();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetComposer() {
    setBody("");
    attach.clear();
    inserted.clear();
    setAllowKeys(new Set<string>());
    setDenyKeys(new Set<string>());
    setAclMode("connections");
    storageDel(DRAFT_KEY);
    setExpanded(false);
  }

  // Hands the inline draft to the hosted full composer, which can then be
  // minimized and carried to another page. Read eagerly (not in a closure) so
  // it captures what the inline composer holds at click time.
  function openFullComposer() {
    openComposer({
      kind: "post",
      scope: "post:new",
      title: t("editor.new_post"),
      props: {
        profileUid: auth()!.uid,
        initialBody: body(),
        initialAclMode: aclMode(),
        initialAllowEntries: allowKeys(),
        onPosted: () => resetComposer(),
      },
    });
  }

  return (
    <div data-tour="hq.composer" class="bg-surface border border-rim rounded-2xl p-3.5 shadow-sm flex flex-col max-w-5xl mx-auto">

      {/* Header — hidden while compact */}
      <Show when={expanded()}>
        <div class="mb-2.5">
          <span class="text-xs font-medium uppercase tracking-wider text-muted">
            {t("hq.post_composer")}
          </span>
        </div>
      </Show>

      {/* Body area — single line when compact, grows to fill card height when expanded */}
      <div
        ref={wiring.wrapperRef}
        class={"flex gap-2.5 " + (expanded() ? "flex-1 min-h-[84px] items-start" : "items-center")}
      >
        <Show when={auth()?.nick}>
          <Show
            when={viewer()?.avatar}
            fallback={
              <div class="w-7 h-7 rounded-full bg-accent-muted text-accent flex items-center
                          justify-center shrink-0 mt-0.5 select-none">
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

        <Show
          when={expanded()}
          fallback={
            <button
              type="button"
              data-tour="hq.composer.placeholder"
              onClick={expandAndFocus}
              class="flex-1 text-left bg-transparent text-sm text-muted
                     focus:outline-none truncate"
            >
              {t("editor.write_placeholder")}
            </button>
          }
        >
          <div ref={bodyEl} class="flex-1 min-w-0">
            <RichEditor
              body={body()}
              onInput={setBody}
              mimetype={MIME}
              capabilities={CAPS}
              tab={tab()}
              onTabChange={setTab}
              onCtrlEnter={() => { if (!wiring.mention.open()) void handleSubmit(); }}
              onPasteFiles={(files) => attach.addUploads(files)}
              onImageAlt={(src, alt) => attach.setAltByUrl(src, alt)}
              placeholder={t("editor.write_placeholder")}
              minHeight="60px"
              maxHeight="480px"
              toolbarTrailing={
                <>
                  <button
                    type="button"
                    title={t("editor.clear_composer")}
                    onClick={resetComposer}
                    class="w-7 h-7 flex items-center justify-center rounded text-muted
                           hover:bg-elevated hover:text-red-500 transition-colors"
                  >
                    <BiRegularEraser class="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t("editor.open_full_composer")}
                    data-tour="hq.composer.full"
                    onClick={openFullComposer}
                    class="w-7 h-7 flex items-center justify-center rounded text-muted
                           hover:bg-elevated hover:text-txt transition-colors"
                  >
                    <MdOutlineOpen_in_full class="w-3.5 h-3.5" />
                  </button>
                </>
              }
            />
          </div>
        </Show>
      </div>

      {/* ACL + submit row — clear and open-in-full ride the editor's own toolbar. */}
      <Show when={expanded()}>
        <div class="flex items-center gap-1 mt-1.5 flex-wrap">
          <AclPicker
            dataTour="hq.composer.acl"
            mode={aclMode()}
            onModeChange={setAclMode}
            allowEntries={allowKeys()}
            denyEntries={denyKeys()}
            onToggle={toggleEntry}
            onClear={() => { setAllowKeys(new Set<string>()); setDenyKeys(new Set<string>()); }}
          />

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting() || attach.uploading() || !body().trim()}
            class="ml-auto px-4 py-1 rounded-lg text-xs font-semibold bg-accent text-accent-fg
                   hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting() ? t("editor.posting") : t("editor.post_btn")}
          </button>
        </div>
      </Show>

      {/* Mention + emoji popups */}
      <MentionEmojiPopups wiring={wiring} />
    </div>
  );
}
