import { createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import { MdOutlinePerson, MdOutlineCleaning_services } from "solid-icons/md";
import { useQuickActions, type QuickAction } from "../quick-actions";
import { getNavIcon } from "@/shared/views/NavItem";
import { toast } from "@utsukta/spa-core/store/toast";
import { useAuth, currentNick, isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { motion } from "solid-motionone";
import { openComposer } from "@/shared/views/modal-host";
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
// Same surface and attachment pipeline as every other composer — this bar used
// to hand-roll its own contenteditable, which is where its base64 image paste
// and its dead link button came from. The toolbar is off ("none"): the action
// row below the surface is this bar's only chrome.
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
  // Same rule as PostComposer: markdown when the channel has the feature on,
  // which is also what turns on RichEditor's live markdown rendering.
  const MIME = isFeatureEnabled("markdown") ? "text/markdown" : "text/bbcode";
  const viewer = useNavViewer();
  const quickActions = useQuickActions();
  const [body, setBody] = createSignal("");
  const [aclMode, setAclMode] = createSignal<AclMode>("connections");
  const [allowKeys, setAllowKeys] = createSignal<Set<string>>(new Set<string>());
  const [denyKeys, setDenyKeys] = createSignal<Set<string>>(new Set<string>());
  const [submitting, setSubmitting] = createSignal(false);
  const [expanded, setExpandedRaw] = createSignal(false);
  // Swapping placeholder ↔ editor changes the card's height in one frame; glide
  // it instead. Solid patches the DOM synchronously on set, so measuring either
  // side of the setter gives the before/after heights.
  function setExpanded(v: boolean) {
    if (v === expanded()) return;
    const from = rootEl?.offsetHeight;
    setExpandedRaw(v);
    if (!rootEl || !from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    rootEl.animate(
      [{ height: `${from}px`, overflow: "hidden" }, { height: `${rootEl.offsetHeight}px`, overflow: "hidden" }],
      { duration: 200, easing: "ease-out" },
    );
  }
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
  let rootEl: HTMLDivElement | undefined;

  // Collapse on a click elsewhere on the page. The mention/emoji/ACL panels are
  // Portal-mounted to document.body, i.e. outside #root, so restricting this to
  // clicks inside #root leaves them working without listing them one by one.
  function onDocPointerDown(e: PointerEvent) {
    if (!expanded()) return;
    const target = e.target as Node | null;
    if (!target || !document.getElementById("root")?.contains(target)) return;
    if (rootEl?.contains(target)) return;
    setExpanded(false);
  }
  document.addEventListener("pointerdown", onDocPointerDown);
  onCleanup(() => document.removeEventListener("pointerdown", onDocPointerDown));

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

  // Same list as the quick-compose widget, plus a poll — which has no inline
  // UI here, so it hands off to the full composer with the panel already open.
  const actions = (): QuickAction[] => [
    ...quickActions(),
    {
      key: "poll",
      label: t("editor.poll_toggle"),
      icon: "poll",
      onClick: () => {
        setExpanded(false);
        openComposer({
          kind: "post",
          scope: "post:new",
          title: t("editor.new_post"),
          props: {
            profileUid: auth()!.uid,
            initialBody: body(),
            initialPoll: true,
            onPosted: () => resetComposer(),
          },
        });
      },
    },
  ];

  return (
    <div ref={rootEl} data-tour="hq.composer" class="bg-surface border border-rim rounded-2xl p-3.5 shadow-sm flex flex-col gap-3 max-w-5xl mx-auto">

      {/* Body area — two lines tall until the text outgrows them */}
      <div ref={wiring.wrapperRef} class="flex gap-2.5 items-start">
        <Show when={auth()?.nick}>
          <Show
            when={viewer()?.avatar}
            fallback={
              <div class="w-9 h-9 rounded-full bg-accent-muted text-accent flex items-center
                          justify-center shrink-0 select-none">
                <MdOutlinePerson class="w-4 h-4" />
              </div>
            }
          >
            <img
              src={viewer()!.avatar}
              alt={viewer()!.name}
              class="w-9 h-9 rounded-full object-cover shrink-0 select-none"
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
              class="flex-1 text-left bg-transparent text-base text-muted py-2
                     focus:outline-none truncate"
            >
              {t("editor.write_placeholder")}
            </button>
          }
        >
          <div ref={bodyEl} class="flex-1 min-w-0" use:motion={{ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }}>
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
              minHeight="3.5rem"
              maxHeight="480px"
              hideStats
            />
          </div>
        </Show>
      </div>

      {/* Action row — the quick-compose actions, always visible */}
      <div class="flex items-center gap-2 flex-wrap">
        <For each={actions()}>
          {(action) => (
            <button
              type="button"
              data-tour={`hq.composer.${action.key}`}
              onClick={action.onClick}
              title={action.label}
              aria-label={action.label}
              class="flex h-9 w-9 items-center justify-center rounded-full text-accent
                     hover:bg-elevated transition-colors"
            >
              {getNavIcon(action.icon, 17)}
            </button>
          )}
        </For>
      </div>

      {/* ACL + submit row */}
      <Show when={expanded()}>
        <div class="flex items-center gap-1 flex-wrap" use:motion={{ initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }}>
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
            title={t("editor.clear_composer")}
            aria-label={t("editor.clear_composer")}
            onClick={resetComposer}
            class="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted
                   hover:bg-elevated hover:text-red-500 transition-colors"
          >
            <MdOutlineCleaning_services class="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting() || attach.uploading() || !body().trim()}
            class="px-4 py-1 rounded-lg text-xs font-semibold bg-accent text-accent-fg
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
