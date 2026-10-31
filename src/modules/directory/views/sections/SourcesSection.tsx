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
  MdFillPeople,
  MdFillWarning,
  MdOutlineDelete,
  MdOutlineEdit,
} from "solid-icons/md";
import { useConnectionSearch } from "@/shared/editor/components/useConnectionSearch";
import {
  ALL_CONNECTIONS,
  deleteSource,
  fetchSources,
  saveSource,
  type Source,
} from "../../sources/api";
import { Section, ROW } from "../Section";
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Textarea } from "@ui/Field";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { EmptyState } from "@ui/EmptyState";
import { ListRow } from "@ui/ListRow";
import { Menu, MenuItem } from "@ui/Menu";
import { Modal, ModalPanel } from "@ui/Modal";
import { SearchField } from "@ui/SearchField";
import { Toggle } from "@ui/Toggle";
import { Skeleton } from "@ui/Skeleton";
import { Spinner } from "@ui/Spinner";

// ── Channel picker ────────────────────────────────────────────────────────────

const AllIcon = (props: { size: number }) => (
  <span
    class="rounded-full bg-elevated flex items-center justify-center text-accent-txt shrink-0"
    style={{ width: `${props.size / 4}rem`, height: `${props.size / 4}rem` }}
  >
    <MdFillPeople size={props.size * 2} />
  </span>
);

// On edit the source's channel is fixed: re-pointing an existing source is
// indistinguishable from delete-and-recreate, and swapping src_xchan would
// strand the rself abconfig on the old connection.
const ChannelPicker: Component<{
  value: string;
  name: string | null;
  /** Edit mode: show the choice, no way to change it. */
  locked?: boolean;
  onSelect: (xchan: string, name: string | null) => void;
}> = (props) => {
  const { t } = useI18n();
  // "a" = abook only, matching core's mod_sources.js. "c" merges the entire
  // xchan table in, which is both slow and lists non-connections.
  const search = useConnectionSearch("a");
  // Core's "a" has no abook_self filter; importing your own posts is nonsense.
  const options = () => search.list().filter((c) => c.self !== "abook-self");

  return (
    <Show
      when={!props.value}
      fallback={
        <div class="flex items-center gap-2 rounded-xl bg-elevated/60 px-3 py-2">
          <AllIcon size={6} />
          <span class="text-sm text-txt truncate">
            {props.value === ALL_CONNECTIONS
              ? t("sources.all_connections")
              : props.name || props.value}
          </span>
          <Show when={!props.locked}>
            <IconButton
              label={t("sources.change_channel")}
              size="sm"
              class="ml-auto"
              onClick={() => props.onSelect("", null)}
            >
              <MdFillClose size={14} />
            </IconButton>
          </Show>
        </div>
      }
    >
      <div class="space-y-2">
        <SearchField
          class="w-full"
          autocomplete="off"
          label={t("sources.search_connections")}
          clearLabel={t("ui.clear")}
          placeholder={t("sources.search_connections")}
          value={search.query()}
          onInput={search.setQuery}
        />
        <ul class="max-h-56 overflow-y-auto space-y-0.5">
          <li>
            <ListRow
              class="rounded-xl items-center!"
              onClick={() => props.onSelect(ALL_CONNECTIONS, null)}
              leading={<AllIcon size={7} />}
              title={t("sources.all_connections")}
            />
          </li>
          <For each={options()}>
            {(c) => (
              <li>
                <ListRow
                  class="rounded-xl items-center!"
                  onClick={() => props.onSelect(String(c.xid), c.name)}
                  leading={<Avatar src={c.photo} name={c.name} size={7} />}
                  title={<span class="block truncate">{c.name}</span>}
                />
              </li>
            )}
          </For>
        </ul>
        <Show when={search.loading()}>
          <Spinner size="sm" />
        </Show>
        <Show when={!search.loading() && options().length === 0}>
          <p class="py-2 text-xs text-muted text-center">{t("sources.no_connections")}</p>
        </Show>
      </div>
    </Show>
  );
};

// ── Create / edit dialog ──────────────────────────────────────────────────────

const SourceDialog: Component<{
  initial?: Source;
  onSubmit: (v: { xchan: string; words: string; tags: string; resend: boolean }) => Promise<void>;
  onClose: () => void;
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
    <Modal onClose={props.onClose} dismissOnBackdrop={false}>
      <ModalPanel
        size="md"
        title={props.initial ? t("sources.edit") : t("sources.new_source")}
        onClose={props.onClose}
        class="flex flex-col max-h-[90vh]"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              {t("sources.cancel")}
            </Button>
            <Button size="sm" onClick={submit} disabled={busy() || !xchan()}>
              <Show when={busy()}><Spinner size="xs" /></Show>
              {t("sources.save")}
            </Button>
          </>
        }
      >
        <div class="p-4 space-y-4 overflow-y-auto min-h-0">
          <div class="space-y-1.5">
            <p class="text-xs font-medium text-txt">{t("sources.channel_name")}</p>
            <ChannelPicker
              value={xchan()}
              name={name()}
              locked={!!props.initial}
              onSelect={(x, n) => { setXchan(x); setName(n); }}
            />
          </div>
          <Field label={t("sources.words_label")} hint={t("sources.words_help")}>
            <Textarea class="w-full" rows={3} value={words()} onInput={(e) => setWords(e.currentTarget.value)} />
          </Field>
          <Field label={t("sources.tags_label")} hint={t("sources.tags_help")}>
            <Input class="w-full" type="text" value={tags()} onInput={(e) => setTags(e.currentTarget.value)} />
          </Field>
          <Toggle
            label={t("sources.resend_label")}
            hint={t("sources.resend_help")}
            checked={resend()}
            onChange={setResend}
          />
          <Show when={error()}>
            <p class="text-xs text-danger-txt" role="alert">{error()}</p>
          </Show>
        </div>
      </ModalPanel>
    </Modal>
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
    <div>
      <ListRow
        class={ROW}
        leading={
          <Show when={props.source.photo} fallback={<AllIcon size={10} />}>
            <Avatar src={props.source.photo!} name={label()} size={10} />
          </Show>
        }
        title={<span class="block font-medium truncate">{label()}</span>}
        subtitle={
          <span class="block truncate">
            {props.source.words || t("sources.all_public_content")}
          </span>
        }
        meta={
          <Show when={categories().length > 0 || props.source.resend}>
            <span class="flex flex-wrap items-center gap-1 pt-0.5">
              <For each={categories()}>{(c) => <Badge size="sm">{c}</Badge>}</For>
              <Show when={props.source.resend}>
                <Badge tone="accent" size="sm">{t("sources.resend_badge")}</Badge>
              </Show>
            </span>
          </Show>
        }
        trailing={
          <span class="flex items-center gap-0.5">
            <IconButton label={t("sources.edit")} size="sm" onClick={props.onEdit}>
              <MdOutlineEdit size={15} />
            </IconButton>
            <Menu label={t("directory.more_actions")} placement="bottom-end" class="w-44">
              <MenuItem danger icon={<MdOutlineDelete size={16} />} onClick={props.onDelete}>
                {t("sources.delete")}
              </MenuItem>
            </Menu>
          </span>
        }
      />
      {/* Core's UI hides this, so a source that silently imports nothing is the
          classic support question. Surface it. */}
      <Show when={!props.source.republish_granted}>
        <p class="flex items-start gap-1.5 pl-16 pr-3 pb-2 text-xs text-warning-txt">
          <MdFillWarning size={13} class="mt-0.5 shrink-0" />
          <span>
            {t("sources.no_republish")}{" "}
            <A href="/directory/connections" class="underline">
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
  // null = closed, "new" = create, a Source = editing it.
  const [dialog, setDialog] = createSignal<Source | "new" | null>(null);

  const handleDelete = async (s: Source) => {
    const label = s.xchan === ALL_CONNECTIONS ? t("sources.all_connections") : s.name || s.xchan;
    if (!confirm(t("sources.confirm_delete", { name: label }))) return;
    await deleteSource(s.id);
    refetch();
  };

  return (
    <Section
      title={t("sources.title")}
      description={<>{t("sources.description")} {t("sources.import_desc")}</>}
      actions={[{
        label: t("sources.new_source"),
        icon: MdFillAdd,
        onClick: () => setDialog("new"),
        primary: true,
      }]}
    >
      <Show
        when={!sources.loading || sources()}
        fallback={
          <div class="space-y-0.5">
            <For each={[1, 2, 3]}>
              {() => (
                <div class="flex items-center gap-3 px-3 py-2">
                  <Skeleton rounded="full" tone="overlay" class="w-10 h-10 shrink-0" />
                  <div class="flex-1 space-y-2">
                    <Skeleton tone="overlay" class="h-3.5 w-1/4" />
                    <Skeleton tone="overlay" class="h-3 w-1/2" />
                  </div>
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show
          when={(sources() ?? []).length > 0}
          fallback={
            <EmptyState
              icon={<MdFillPeople />}
              action={<Button size="sm" onClick={() => setDialog("new")}>{t("sources.new_source")}</Button>}
            >
              {t("sources.no_sources")}
            </EmptyState>
          }
        >
          <div class="space-y-0.5 -mx-3">
            <For each={sources()}>
              {(s) => (
                <SourceRow
                  source={s}
                  onEdit={() => setDialog(s)}
                  onDelete={() => handleDelete(s)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={dialog()}>
        {(d) => (
          <SourceDialog
            initial={d() === "new" ? undefined : (d() as Source)}
            onClose={() => setDialog(null)}
            onSubmit={async (v) => {
              const cur = d();
              await saveSource(cur === "new" ? v : { ...v, id: cur.id });
              setDialog(null);
              refetch();
            }}
          />
        )}
      </Show>
    </Section>
  );
};

export default SourcesSection;
