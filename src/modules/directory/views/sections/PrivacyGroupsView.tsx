// modules/directory/views/sections/PrivacyGroupsView.tsx
//
// Rendered by ConnectionsShellView when activeKey === "privacy-groups"
// and there is no :id param present.

import {
  createSignal,
  For,
  Show,
  onMount,
  type Component,
} from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  MdFillGroup,
  MdFillAdd,
  MdFillDelete,
  MdFillVisibility,
  MdFillVisibility_off,
  MdFillStar,
  MdFillStar_border,
  MdFillClose,
  MdFillExpand_more,
  MdFillExpand_less,
} from "solid-icons/md";
import SubPageContent from "@/shared/views/SubPageContent";
import PageActions from "@/shared/views/layout/PageActions";
import {
  groups,
  loading,
  loadGroups,
  createGroup,
  deleteGroup,
  updateGroup,
} from "../../groups/store";
import { fetchGroup } from "../../groups/api";
import type { PrivacyGroup, GroupContact } from "../../groups/api";
import CardShell from "@/shared/stream/CardShell";
import { Button, IconButton } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { EmptyState } from "@ui/EmptyState";

// ── Inline create form ────────────────────────────────────────────────────────

const CreateForm: Component<{ onDone: () => void }> = (props) => {
  const { t } = useI18n();
  const [name, setName] = createSignal("");
  const [visible, setVisible] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!name().trim()) return;
    setBusy(true);
    await createGroup(name().trim(), visible());
    setBusy(false);
    setName("");
    setVisible(false);
    props.onDone();
  }

  return (
    <div class="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
      <div class="flex gap-2">
        <Input
          class="flex-1"
          autofocus
          type="text"
          placeholder={t("directory.group_name_placeholder")}
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Escape" && props.onDone()}
        />
        <Button size="sm" class="shrink-0" onClick={submit} disabled={busy() || !name().trim()}>
          {busy() ? t("directory.creating") : t("directory.create")}
        </Button>
        <IconButton label="Cancel" size="sm" class="shrink-0" onClick={props.onDone}>
          <MdFillClose size={16} />
        </IconButton>
      </div>
      <label class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={visible()}
          onChange={(e) => setVisible(e.currentTarget.checked)}
          class="accent-[var(--accent)]"
        />
        {t("directory.members_visible")}
      </label>
    </div>
  );
};

// ── Group row ─────────────────────────────────────────────────────────────────

const GroupRow: Component<{ group: PrivacyGroup }> = (props) => {
  const { t } = useI18n();
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [members, setMembers] = createSignal<GroupContact[] | null>(null);
  const [membersLoading, setMembersLoading] = createSignal(false);

  async function handleDelete(e: Event) {
    e.preventDefault();
    if (!confirm(`Delete group "${props.group.name}"?`)) return;
    setDeleteBusy(true);
    await deleteGroup(props.group.id);
    setDeleteBusy(false);
  }

  async function toggleDefaultAcl(e: Event) {
    e.preventDefault();
    await updateGroup(props.group.id, { set_default_acl: !props.group.is_default_acl });
  }

  async function toggleExpanded() {
    const next = !expanded();
    setExpanded(next);
    if (next && members() === null) {
      setMembersLoading(true);
      try {
        const detail = await fetchGroup(props.group.id);
        setMembers(detail.members);
      } finally {
        setMembersLoading(false);
      }
    }
  }

  return (
    <Card class="px-4 py-3">
      <div class="flex items-center gap-3">
        <button
          onClick={toggleExpanded}
          title={expanded() ? t("directory.hide_members") : t("directory.view_members")}
          class="text-muted hover:text-accent transition-colors shrink-0"
        >
          {expanded() ? <MdFillExpand_less size={18} /> : <MdFillExpand_more size={18} />}
        </button>

        <span class="text-accent shrink-0">
          <MdFillGroup size={20} />
        </span>

        {/* Name + badges */}
        <div class="flex-1 min-w-0">
          <A
            href={`/directory/privacy-groups/${props.group.id}`}
            class="text-sm font-medium text-txt hover:text-accent truncate block"
          >
            {props.group.name}
          </A>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs text-muted">
              {t("directory.member_count", { count: String(props.group.member_count) })}
            </span>
            <span class="flex items-center gap-1 text-xs text-muted">
              {props.group.visible
                ? <><MdFillVisibility size={11} />{t("directory.visible_label")}</>
                : <><MdFillVisibility_off size={11} />{t("directory.private_label")}</>}
            </span>
            <Show when={props.group.is_default_group}>
              <span class="text-xs text-accent">· {t("directory.default_group")}</span>
            </Show>
            <Show when={props.group.is_default_acl}>
              <span class="text-xs text-accent">· {t("directory.default_acl")}</span>
            </Show>
          </div>
        </div>

        {/* Star = default ACL shortcut */}
        <button
          onClick={toggleDefaultAcl}
          title={props.group.is_default_acl ? t("directory.remove_default_acl") : t("directory.set_default_acl")}
          class="text-muted hover:text-accent transition-colors"
        >
          {props.group.is_default_acl
            ? <MdFillStar size={17} class="text-accent" />
            : <MdFillStar_border size={17} />}
        </button>

        <A
          href={`/directory/privacy-groups/${props.group.id}`}
          class="text-xs border border-rim text-muted hover:bg-elevated rounded-lg px-3 py-1.5 transition-colors"
        >
          {t("directory.edit_label")}
        </A>

        <IconButton
          label={t("directory.delete_group")}
          variant="danger"
          onClick={handleDelete}
          disabled={deleteBusy()}
        >
          <MdFillDelete size={17} />
        </IconButton>
      </div>

      <Show when={expanded()}>
        <div class="mt-3 pt-3 border-t border-rim pl-9">
          <Show
            when={!membersLoading()}
            fallback={<p class="text-muted text-xs">{t("directory.loading")}</p>}
          >
            <Show
              when={(members() ?? []).length > 0}
              fallback={<p class="text-muted text-xs">{t("directory.no_members")}</p>}
            >
              <div class="flex flex-wrap gap-2">
                <For each={members()}>
                  {(m) => (
                    <span class="flex items-center gap-1.5 bg-elevated rounded-full pl-1 pr-2.5 py-1 text-xs text-txt">
                      <img
                        src={m.photo}
                        alt={m.name}
                        class="w-5 h-5 rounded-full object-cover bg-overlay"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                      {m.name}
                    </span>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </Show>
    </Card>
  );
};

// ── View ──────────────────────────────────────────────────────────────────────

const PrivacyGroupsView: Component = () => {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = createSignal(false);
  onMount(() => loadGroups());

  return (
    <SubPageContent
      title={t("directory.privacy_groups_title")}
      description={t("directory.privacy_groups_desc")}
      action={
        <PageActions actions={[{
          label: showCreate() ? t("directory.cancel") : t("directory.create"),
          icon: showCreate() ? MdFillClose : MdFillAdd,
          onClick: () => setShowCreate((v) => !v),
        }]} />
      }
    >
      <Show when={showCreate()}>
        <CreateForm onDone={() => setShowCreate(false)} />
      </Show>

      <Show
        when={!loading()}
        fallback={
          <div class="space-y-2">
            <For each={[1, 2, 3]}>
              {() => <div class="bg-surface border border-rim rounded-xl h-14 animate-pulse" />}
            </For>
          </div>
        }
      >
        <Show
          when={groups().length > 0}
          fallback={
            <Show when={!showCreate()}>
              <EmptyState>
                {t("directory.no_privacy_groups")}
              </EmptyState>
            </Show>
          }
        >
          <div class="space-y-2">
            <For each={groups()}>{(g) => <CardShell uuid={`group:${g.hash}`}><GroupRow group={g} /></CardShell>}</For>
          </div>
        </Show>
      </Show>
    </SubPageContent>
  );
};

export default PrivacyGroupsView;
