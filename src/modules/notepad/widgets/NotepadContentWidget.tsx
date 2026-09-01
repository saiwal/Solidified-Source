import { createEffect, createSignal, onMount, Show, For } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { MdOutlineEdit_note } from "solid-icons/md";
import { FiChevronDown, FiChevronUp } from "solid-icons/fi";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { useI18n } from "@utsukta/spa-core/i18n";
import { renderBody } from "@utsukta/spa-core/lib/renderBody";
import { hydrateLatex } from "@utsukta/spa-core/lib/hydrateLatex";
import { handleDecryptClick } from "@utsukta/spa-core/lib/decrypt-click";
import AttachmentList from "@/shared/stream/components/AttachmentList";
import NoteComposer from "@/shared/editor/composers/NoteComposer";
import { notes, loading, hasMore, loadNotes, removeNote } from "../store";
import type { Note } from "../api";

function fmtDate(iso: string, locale: string): string {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(locale, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function NoteCard(props: {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
  confirmingDelete: boolean;
  onCancelDelete: () => void;
}) {
  const { t, locale } = useI18n();

  let bodyRef: HTMLDivElement | undefined;
  const [expanded, setExpanded] = createSignal(false);
  const [overflowing, setOverflowing] = createSignal(false);

  const checkOverflow = () => {
    if (!bodyRef) return;
    // scrollHeight vs clientHeight only tells us something when clamped
    setOverflowing(bodyRef.scrollHeight > bodyRef.clientHeight + 1);
  };

  onMount(() => {
    checkOverflow();
    // content may reflow after images/fonts load
    const ro = new ResizeObserver(() => checkOverflow());
    if (bodyRef) ro.observe(bodyRef);
    return () => ro.disconnect();
  });

  createEffect(() => {
    // re-check whenever the note body changes (e.g. after edit)
    props.note.body;
    if (!expanded()) queueMicrotask(checkOverflow);
  });

  createEffect(() => {
    props.note.body;
    if (bodyRef) hydrateLatex(bodyRef);
  });

  return (
    <div class="bg-surface border border-rim rounded-xl p-4 space-y-3 group hover:border-rim-strong transition-colors">
      <div
        ref={bodyRef}
        class={`prose prose-sm dark:prose-invert max-w-none text-txt leading-relaxed
               [&_a]:text-accent [&_a]:no-underline [&_a:hover]:underline
               ${expanded() ? "" : "line-clamp-6"}`}
        innerHTML={renderBody(props.note.body, props.note.mimetype)}
        onClick={handleDecryptClick}
      />

      <Show when={props.note.attach.length > 0}>
        <AttachmentList attachments={props.note.attach} compact />
      </Show>

      <Show when={overflowing() || expanded()}>
        <button
          onClick={() => setExpanded((v) => !v)}
          class="flex items-center gap-1 text-xs text-muted hover:text-txt transition-colors"
        >
          <Show
            when={expanded()}
            fallback={<><FiChevronDown class="text-sm" />{t("notepad.show_more")}</>}
          >
            <FiChevronUp class="text-sm" />
            {t("notepad.show_less")}
          </Show>
        </button>
      </Show>

      <div class="flex items-center justify-between text-xs text-muted">
        <span>{fmtDate(props.note.edited || props.note.created, locale())}</span>

        <Show
          when={!props.confirmingDelete}
          fallback={
            <span class="inline-flex gap-2 items-center">
              <span>{t("notepad.delete_confirm")}</span>
              <button
                onClick={props.onDelete}
                class="px-2 py-0.5 rounded bg-red-600 text-white text-xs hover:bg-red-700 transition-colors"
              >
                {t("notepad.delete")}
              </button>
              <button
                onClick={props.onCancelDelete}
                class="px-2 py-0.5 rounded border border-rim text-muted hover:bg-elevated transition-colors"
              >
                {t("notepad.cancel")}
              </button>
            </span>
          }
        >
          <span class="inline-flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <button
              onClick={props.onEdit}
              class="px-2 py-0.5 rounded border border-rim text-muted hover:bg-elevated transition-colors"
            >
              {t("notepad.edit")}
            </button>
            <button
              onClick={props.onDelete}
              class="px-2 py-0.5 rounded border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
            >
              {t("notepad.delete")}
            </button>
          </span>
        </Show>
      </div>
    </div>
  );
}

export default function NotepadContentWidget() {
  const { t } = useI18n();
  const auth = useAuth();
  const role = useViewerRole();
  const [searchParams] = useSearchParams();

  const [editingNote, setEditingNote] = createSignal<Note | null>(null);
  const [confirmMid, setConfirmMid] = createSignal<string | null>(null);

  const nick = () => auth()?.nick || "";
  const isOwner = () => role() === "owner";

  const activeTag    = () => String(searchParams.tag ?? "");
  const activeDbegin = () => String(searchParams.dbegin ?? "");
  const activeSearch = () => String(searchParams.search ?? "");
  const hasFilters   = () => !!(activeTag() || activeDbegin() || activeSearch());

  createEffect(() => {
    if (!auth.loading && nick()) {
      loadNotes(true, {
        tag:    activeTag()    || undefined,
        dbegin: activeDbegin() || undefined,
        dend:   String(searchParams.dend ?? "") || undefined,
        search: activeSearch() || undefined,
      });
    }
  });

  return (
    <div class="max-w-3xl mx-auto space-y-6">
      <Show when={isOwner()}>
        <Show
          when={editingNote() === null}
          fallback={
            <div class="bg-surface border border-accent/30 rounded-xl p-4">
              <NoteComposer
                nick={nick()}
                initial={{
                  mid:      editingNote()!.mid,
                  body:     editingNote()!.body,
                  mimetype: editingNote()!.mimetype,
                }}
                onSaved={() => { setEditingNote(null); loadNotes(true); }}
                onCancel={() => setEditingNote(null)}
              />
            </div>
          }
        >
          <div class="bg-surface border border-rim rounded-xl p-4">
            <NoteComposer
              nick={nick()}
              onSaved={() => loadNotes(true)}
            />
          </div>
        </Show>
      </Show>

      <Show when={loading() && notes().length === 0}>
        <div class="space-y-3">
          <For each={Array(3).fill(0)}>
            {() => (
              <div class="bg-surface border border-rim rounded-xl p-4 space-y-2 animate-pulse">
                <div class="h-3 bg-elevated rounded w-full" />
                <div class="h-3 bg-elevated rounded w-5/6" />
                <div class="h-3 bg-elevated rounded w-4/6" />
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={!loading() && notes().length === 0}>
        <div class="text-center py-16 space-y-3 text-muted">
          <MdOutlineEdit_note class="text-3xl text-muted mx-auto" />
          <p class="text-sm">{hasFilters() ? t("notepad.no_notes_filtered") : t("notepad.no_notes")}</p>
          <Show when={isOwner() && !hasFilters()}>
            <p class="text-xs">{t("notepad.create_first")}</p>
          </Show>
        </div>
      </Show>

      <Show when={notes().length > 0}>
        <div class="space-y-3">
          <For each={notes()}>
            {(note) => (
              <NoteCard
                note={note}
                onEdit={() => { setConfirmMid(null); setEditingNote(note); }}
                onDelete={() => {
                  if (confirmMid() === note.mid) {
                    setConfirmMid(null);
                    removeNote(note);
                  } else {
                    setConfirmMid(note.mid);
                  }
                }}
                confirmingDelete={confirmMid() === note.mid}
                onCancelDelete={() => setConfirmMid(null)}
              />
            )}
          </For>
        </div>

        <Show when={hasMore()}>
          <div class="flex justify-center">
            <button
              onClick={() => loadNotes(false)}
              disabled={loading()}
              class="px-4 py-2 text-sm rounded-lg border border-rim bg-surface text-muted
                     hover:bg-elevated transition-colors disabled:opacity-40"
            >
              {loading() ? "…" : t("notepad.load_more")}
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
}
