// modules/directory/views/sections/SourcesSection.tsx
//
// Rendered by ConnectionsShellView when activeKey === "sources".
//
// A source nominates a connection whose public posts get re-owned by your
// channel and redistributed to your own connections. Field labels are lifted
// from core's Zotlabs/Module/Sources.php so they match the Hubzilla docs.

import { createSignal, For, Show, type Component } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import {
  MdFillAdd,
  MdFillClose,
  MdFillDelete,
  MdFillEdit,
  MdFillPeople,
  MdFillWarning,
} from "solid-icons/md";
import SubPageContent from "@/shared/views/SubPageContent";
import { useConnectionSearch } from "@/shared/editor/components/useConnectionSearch";
import {
  ALL_CONNECTIONS,
  deleteSource,
  fetchSources,
  saveSource,
  type Source,
} from "../../sources/api";

const inputClass =
  "w-full bg-elevated border border-rim rounded-lg px-2 py-1.5 text-sm text-txt";

// ── Channel picker ────────────────────────────────────────────────────────────

// On edit the source's channel is fixed: re-pointing an existing source is
// indistinguishable from delete-and-recreate, and swapping src_xchan would
// strand the rself abconfig on the old connection.
const ChannelPicker: Component<{
  value: string;
  name: string | null;
  onSelect: (xchan: string, name: string | null) => void;
}> = (props) => {
  const { t } = useI18n();
  const search = useConnectionSearch("c");

  return (
    <Show
      when={!props.value}
      fallback={
        <div class="flex items-center gap-2 rounded-lg bg-elevated border border-rim px-2 py-1.5">
          <MdFillPeople size={16} class="text-accent shrink-0" />
          <span class="text-sm text-txt truncate">
            {props.value === ALL_CONNECTIONS
              ? t("sources.all_connections")
              : props.name || props.value}
          </span>
          <button
            onClick={() => props.onSelect("", null)}
            class="ml-auto text-muted hover:text-txt transition-colors shrink-0"
            title={t("sources.change_channel")}
          >
            <MdFillClose size={14} />
          </button>
        </div>
      }
    >
      <div class="space-y-2">
        <input
          type="text"
          class={inputClass}
          autocomplete="off"
          placeholder={t("sources.search_connections")}
          value={search.query()}
          onInput={(e) => search.setQuery(e.currentTarget.value)}
        />
        <div class="max-h-48 overflow-y-auto rounded-lg border border-rim divide-y divide-rim">
          <button
            onClick={() => props.onSelect(ALL_CONNECTIONS, null)}
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-elevated transition-colors"
          >
            <MdFillPeople size={16} class="text-accent shrink-0" />
            <span class="text-sm text-txt">{t("sources.all_connections")}</span>
          </button>
          <For each={search.list()}>
            {(c) => (
              <button
                onClick={() => props.onSelect(String(c.xid), c.name)}
                class="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-elevated transition-colors"
              >
                <img
                  src={c.photo}
                  alt=""
                  class="w-5 h-5 rounded-full object-cover bg-overlay shrink-0"
                  onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
                />
                <span class="text-sm text-txt truncate">{c.name}</span>
              </button>
            )}
          </For>
          <Show when={!search.loading() && search.list().length === 0}>
            <p class="px-2 py-3 text-xs text-muted text-center">
              {t("sources.no_connections")}
            </p>
          </Show>
        </div>
      </div>
    </Show>
  );
};

// ── Create / edit form ────────────────────────────────────────────────────────

const SourceForm: Component<{
  initial?: Source;
  onSubmit: (v: { xchan: string; words: string; tags: string; resend: boolean }) => Promise<void>;
  onCancel: () => void;
}> = (props) => {
  const { t } = useI18n();
  const [xchan, setXchan] = createSignal(props.initial?.xchan ?? "");
  const [name, setName] = createSignal(props.initial?.name ?? null);
  const [words, setWords] = createSignal(props.initial?.words ?? "");
  const [tags, setTags] = createSignal(props.initial?.tags ?? "");
  const [resend, setResend] = createSignal(props.initial?.resend ?? false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await props.onSubmit({
        xchan: xchan(),
        words: words().trim(),
        tags: tags().trim(),
        resend: resend(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="bg-surface border border-accent/30 rounded-xl p-3 space-y-3">
      <div class="space-y-1">
        <label class="text-xs font-medium text-txt">{t("sources.channel_name")}</label>
        <Show
          when={!props.initial}
          fallback={
            <div class="flex items-center gap-2 rounded-lg bg-elevated border border-rim px-2 py-1.5">
              <MdFillPeople size={16} class="text-muted shrink-0" />
              <span class="text-sm text-muted truncate">
                {xchan() === ALL_CONNECTIONS ? t("sources.all_connections") : name() || xchan()}
              </span>
            </div>
          }
        >
          <ChannelPicker
            value={xchan()}
            name={name()}
            onSelect={(x, n) => { setXchan(x); setName(n); }}
          />
        </Show>
      </div>

      <div class="space-y-1">
        <label class="text-xs font-medium text-txt">{t("sources.words_label")}</label>
        <textarea
          rows={3}
          class={inputClass}
          value={words()}
          onInput={(e) => setWords(e.currentTarget.value)}
        />
        <p class="text-xs text-muted">{t("sources.words_help")}</p>
      </div>

      <div class="space-y-1">
        <label class="text-xs font-medium text-txt">{t("sources.tags_label")}</label>
        <input
          type="text"
          class={inputClass}
          value={tags()}
          onInput={(e) => setTags(e.currentTarget.value)}
        />
        <p class="text-xs text-muted">{t("sources.tags_help")}</p>
      </div>

      <label class="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={resend()}
          onChange={(e) => setResend(e.currentTarget.checked)}
          class="accent-[var(--accent)] mt-0.5"
        />
        <span class="space-y-0.5">
          <span class="block text-xs font-medium text-txt">{t("sources.resend_label")}</span>
          <span class="block text-xs text-muted">{t("sources.resend_help")}</span>
        </span>
      </label>

      <Show when={error()}>
        <p class="text-xs text-red-500">{error()}</p>
      </Show>

      <div class="flex items-center justify-end gap-2">
        <button
          onClick={props.onCancel}
          class="px-3 py-1.5 rounded-lg text-xs text-muted hover:text-txt hover:bg-elevated transition-colors"
        >
          {t("sources.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={busy() || !xchan()}
          class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium
                 hover:brightness-110 transition-all disabled:opacity-40"
        >
          {t("sources.save")}
        </button>
      </div>
    </div>
  );
};

// ── Row ───────────────────────────────────────────────────────────────────────

const SourceRow: Component<{
  source: Source;
  onEdit: () => void;
  onDelete: () => void;
}> = (props) => {
  const { t } = useI18n();
  const isWildcard = () => props.source.xchan === ALL_CONNECTIONS;
  const label = () =>
    isWildcard() ? t("sources.all_connections") : props.source.name || props.source.xchan;
  const categories = () =>
    props.source.tags.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <div class="group bg-surface border border-rim rounded-xl px-4 py-3 space-y-2">
      <div class="flex items-center gap-3">
        <Show
          when={props.source.photo}
          fallback={
            <span class="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-accent shrink-0">
              <MdFillPeople size={18} />
            </span>
          }
        >
          <img
            src={props.source.photo!}
            alt=""
            class="w-9 h-9 rounded-full object-cover bg-overlay shrink-0"
          />
        </Show>

        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-txt truncate">{label()}</p>
          <p class="text-xs text-muted truncate">
            {props.source.words || t("sources.all_public_content")}
          </p>
        </div>

        <div class="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={props.onEdit}
            class="text-muted hover:text-accent transition-colors"
            title={t("sources.edit")}
          >
            <MdFillEdit size={17} />
          </button>
          <button
            onClick={props.onDelete}
            class="text-muted hover:text-red-500 transition-colors"
            title={t("sources.delete")}
          >
            <MdFillDelete size={17} />
          </button>
        </div>
      </div>

      <Show when={categories().length > 0 || props.source.resend}>
        <div class="flex flex-wrap items-center gap-1.5 pl-12">
          <For each={categories()}>
            {(c) => (
              <span class="text-xs bg-elevated text-muted rounded-full px-2 py-0.5">{c}</span>
            )}
          </For>
          <Show when={props.source.resend}>
            <span class="text-xs text-accent">{t("sources.resend_badge")}</span>
          </Show>
        </div>
      </Show>

      {/* Core's UI hides this, so a source that silently imports nothing is the
          classic support question. Surface it. */}
      <Show when={!props.source.republish_granted}>
        <p class="flex items-start gap-1.5 pl-12 text-xs text-amber-500">
          <MdFillWarning size={13} class="mt-0.5 shrink-0" />
          <span>
            {t("sources.no_republish")}{" "}
            <A href="/directory/connections" class="underline hover:text-amber-400">
              {t("sources.review_connection")}
            </A>
          </span>
        </p>
      </Show>
    </div>
  );
};

// ── View ──────────────────────────────────────────────────────────────────────

const SourcesSection: Component = () => {
  const { t } = useI18n();
  const [sources, { refetch }] = createQueryResource("sources", fetchSources);
  const [creating, setCreating] = createSignal(false);
  const [editingId, setEditingId] = createSignal<number | null>(null);

  const handleDelete = async (s: Source) => {
    const label = s.xchan === ALL_CONNECTIONS ? t("sources.all_connections") : s.name || s.xchan;
    if (!confirm(t("sources.confirm_delete", { name: label }))) return;
    await deleteSource(s.id);
    refetch();
  };

  return (
    <SubPageContent
      title={t("sources.title")}
      description={t("sources.description")}
      action={
        <button
          onClick={() => { setEditingId(null); setCreating((v) => !v); }}
          class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            creating()
              ? "border-accent text-accent bg-accent/10"
              : "border-rim text-muted hover:border-rim-strong hover:text-txt"
          }`}
        >
          <MdFillAdd size={15} />
          {t("sources.new_source")}
        </button>
      }
    >
      <p class="text-xs text-muted">{t("sources.import_desc")}</p>

      <Show when={creating()}>
        <SourceForm
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            await saveSource(v);
            setCreating(false);
            refetch();
          }}
        />
      </Show>

      <Show
        when={!sources.loading}
        fallback={
          <div class="space-y-2">
            <For each={[1, 2, 3]}>
              {() => <div class="bg-surface border border-rim rounded-xl h-16 animate-pulse" />}
            </For>
          </div>
        }
      >
        <Show
          when={(sources() ?? []).length > 0}
          fallback={
            <Show when={!creating()}>
              <p class="text-muted text-sm text-center py-10">{t("sources.no_sources")}</p>
            </Show>
          }
        >
          <div class="space-y-2">
            <For each={sources()}>
              {(s) => (
                <Show
                  when={editingId() !== s.id}
                  fallback={
                    <SourceForm
                      initial={s}
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (v) => {
                        await saveSource({ ...v, id: s.id });
                        setEditingId(null);
                        refetch();
                      }}
                    />
                  }
                >
                  <SourceRow
                    source={s}
                    onEdit={() => { setCreating(false); setEditingId(s.id); }}
                    onDelete={() => handleDelete(s)}
                  />
                </Show>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </SubPageContent>
  );
};

export default SourcesSection;
