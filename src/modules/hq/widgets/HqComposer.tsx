import { createSignal, createEffect, onCleanup, Show, For, type JSX } from "solid-js";
import {
  MdOutlineLink,
  MdOutlinePerson,
  MdOutlineClose,
  MdOutlineFormat_bold,
  MdOutlineFormat_italic,
  MdOutlineFormat_underlined,
} from "solid-icons/md";
import { toast } from "@utsukta/spa-core/store/toast";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useNavViewer } from "@utsukta/spa-core/store/nav-store";
import { motion } from "solid-motionone";
import PostComposer from "@/shared/editor/composers/PostComposer";
import { sourceToHtml } from "@/shared/editor/core/sourceToHtml";
import { htmlToSource } from "@/shared/editor/core/htmlToSource";
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
  const [fullOpen, setFullOpen] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);

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

  // ── WYSIWYG surface ─────────────────────────────────────────────────────
  // A bare contenteditable (no toolbar/tab chrome of its own — this is a
  // compact quick-post bar, not the full composer). `domSig` is the source
  // string the DOM currently reflects; only re-seed the div when body()
  // changed for a reason other than us echoing the DOM back (draft load,
  // reset, mention/emoji insert), same pattern as RichEditor.
  let editorEl: HTMLDivElement | undefined;
  let domSig: string | null = null;

  const seedEditor = (el: HTMLDivElement) => {
    editorEl = el;
    el.innerHTML = sourceToHtml(body(), MIME);
    domSig = body();
  };

  createEffect(() => {
    const b = body();
    if (editorEl && b !== domSig) {
      editorEl.innerHTML = sourceToHtml(b, MIME);
      domSig = b;
      const active = document.activeElement;
      if (editorEl.contains(active) || active === document.body || active === null) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editorEl);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  });

  function onEditorInput() {
    if (!editorEl) return;
    const next = htmlToSource(editorEl.innerHTML, MIME);
    domSig = next;
    setBody(next);
  }

  // Round-trips typed bbcode (links, [b]/[i]/…) into rendered markup once
  // focus leaves the editor — mirrors RichEditor's onEditorBlur.
  function onEditorBlur() {
    if (!editorEl) return;
    const next = htmlToSource(editorEl.innerHTML, MIME);
    editorEl.innerHTML = sourceToHtml(next, MIME);
    domSig = next;
  }

  function exec(cmd: string) {
    if (!editorEl) return;
    editorEl.focus();
    document.execCommand(cmd, false);
  }

  function insertLink() {
    if (!editorEl) return;
    const sel = window.getSelection();
    let savedRange: Range | null = null;
    if (sel && sel.rangeCount > 0) savedRange = sel.getRangeAt(0).cloneRange();
    const hasText = savedRange && !savedRange.collapsed;
    const url = window.prompt("URL:", "https://");
    if (!url) return;
    editorEl.focus();
    if (savedRange) { sel!.removeAllRanges(); sel!.addRange(savedRange); }
    if (hasText) {
      document.execCommand("createLink", false, url);
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.textContent = url;
      const tmp = document.createElement("div");
      tmp.appendChild(a);
      document.execCommand("insertHTML", false, tmp.innerHTML);
    }
    onEditorInput();
  }

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

  function expandAndFocus() {
    setExpanded(true);
    requestAnimationFrame(() => editorEl?.focus());
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

    const mode = aclMode();
    const payload: Record<string, unknown> = {
      body: body(),
      mimetype: "text/bbcode",
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
    setAllowKeys(new Set<string>());
    setDenyKeys(new Set<string>());
    setAclMode("connections");
    storageDel(DRAFT_KEY);
    setExpanded(false);
  }

  const toolbar = [
    { title: () => t("editor.bold"),      label: <MdOutlineFormat_bold class="w-4 h-4" /> as JSX.Element, cls: "", action: () => exec("bold") },
    { title: () => t("editor.italic"),    label: <MdOutlineFormat_italic class="w-4 h-4" /> as JSX.Element, cls: "", action: () => exec("italic") },
    { title: () => t("editor.underline"), label: <MdOutlineFormat_underlined class="w-4 h-4" /> as JSX.Element, cls: "", action: () => exec("underline") },
    { title: () => t("editor.link"),      label: <MdOutlineLink class="w-4 h-4" /> as JSX.Element, cls: "", action: insertLink },
  ];

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
          <div
            ref={seedEditor}
            contenteditable
            dir="ltr"
            onInput={onEditorInput}
            onBlur={onEditorBlur}
            data-placeholder={t("editor.write_placeholder")}
            style={{ "min-height": "60px", "max-height": "480px" }}
            class="flex-1 min-w-0 overflow-y-auto bg-transparent text-sm text-txt
                   focus:outline-none leading-relaxed
                   empty:before:content-[attr(data-placeholder)]
                   empty:before:text-muted empty:before:pointer-events-none"
          />
        </Show>
      </div>

      {/* Toolbar row */}
      <Show when={expanded()}>
        <div class="flex items-center gap-0.5 mt-1.5 pt-1.5 border-t border-rim">
          <For each={toolbar}>
            {(btn) => (
              <button
                type="button"
                title={btn.title()}
                onMouseDown={(e) => { e.preventDefault(); btn.action(); }}
                class={`w-7 h-7 flex items-center justify-center rounded text-xs text-muted
                        hover:bg-elevated hover:text-txt transition-colors ${btn.cls}`}
              >
                {btn.label}
              </button>
            )}
          </For>

          {/* Reset */}
          <button
            type="button"
            title={t("editor.clear_composer")}
            onClick={resetComposer}
            class="ml-auto w-7 h-7 flex items-center justify-center rounded text-muted
                   hover:bg-elevated hover:text-red-500 transition-colors"
          >
            <MdOutlineClose class="w-3.5 h-3.5" />
          </button>

          {/* Open full composer */}
          <button
            type="button"
            title={t("editor.open_full_composer")}
            data-tour="hq.composer.full"
            onClick={() => setFullOpen(true)}
            class="w-7 h-7 flex items-center justify-center rounded text-muted
                   hover:bg-elevated hover:text-txt transition-colors"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        </div>

        {/* ACL + submit row */}
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
            disabled={submitting() || !body().trim()}
            class="ml-auto px-4 py-1 rounded-lg text-xs font-semibold bg-accent text-accent-fg
                   hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {submitting() ? t("editor.posting") : t("editor.post_btn")}
          </button>
        </div>
      </Show>

      {/* Mention + emoji popups */}
      <MentionEmojiPopups wiring={wiring} />

      {/* Full composer modal — remounts on open so initialBody/initialAclMode capture current state */}
      <Show when={fullOpen()}>
        <PostComposer
          profileUid={auth()!.uid}
          open={true}
          onClose={() => setFullOpen(false)}
          initialBody={body()}
          initialAclMode={aclMode()}
          initialAllowEntries={allowKeys()}
          onPosted={() => resetComposer()}
        />
      </Show>
    </div>
  );
}
