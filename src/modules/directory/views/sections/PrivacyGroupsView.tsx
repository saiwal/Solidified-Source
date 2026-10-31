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
import { A, useNavigate } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  MdFillGroup,
  MdFillAdd,
  MdOutlineDelete,
  MdOutlineEdit,
  MdFillStar,
  MdFillStar_border,
  MdFillExpand_more,
} from "solid-icons/md";
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
import { Section, ROW } from "../Section";
import { Button, IconButton } from "@ui/Button";
import { Field, Input } from "@ui/Field";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { EmptyState } from "@ui/EmptyState";
import { ListRow } from "@ui/ListRow";
import { Menu, MenuItem, MenuSeparator } from "@ui/Menu";
import { Modal, ModalPanel } from "@ui/Modal";
import { Toggle } from "@ui/Toggle";
import { Skeleton } from "@ui/Skeleton";
import { Spinner } from "@ui/Spinner";

// ── Create dialog ─────────────────────────────────────────────────────────────

const CreateDialog: Component<{ onClose: () => void }> = (props) => {
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
    props.onClose();
  }

  return (
    <Modal onClose={props.onClose} dismissOnBackdrop={false}>
      {/* contents: the panel, not the form, is the dialog's flex child. */}
      <form class="contents" onSubmit={submit}>
        <ModalPanel
          size="sm"
          title={t("directory.new_group")}
          onClose={props.onClose}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={props.onClose}>{t("directory.cancel")}</Button>
              <Button size="sm" type="submit" disabled={busy() || !name().trim()}>
                {busy() ? t("directory.creating") : t("directory.create")}
              </Button>
            </>
          }
        >
          <div class="p-4 space-y-4">
            <Field label={t("directory.group_name_input")}>
              <Input
                class="w-full"
                autofocus
                type="text"
                placeholder={t("directory.group_name_placeholder")}
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </Field>
            <Toggle
              label={t("directory.members_visible")}
              checked={visible()}
              onChange={setVisible}
            />
          </div>
        </ModalPanel>
      </form>
    </Modal>
  );
};

// ── Group row ─────────────────────────────────────────────────────────────────

const GroupRow: Component<{ group: PrivacyGroup }> = (props) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [members, setMembers] = createSignal<GroupContact[] | null>(null);
  const href = () => `/directory/privacy-groups/${props.group.id}`;

  async function handleDelete() {
    if (!confirm(t("directory.confirm_delete_group", { name: props.group.name }))) return;
    setDeleteBusy(true);
    await deleteGroup(props.group.id);
    setDeleteBusy(false);
  }

  async function toggleDefaultAcl() {
    await updateGroup(props.group.id, { set_default_acl: !props.group.is_default_acl });
  }

  async function toggleExpanded() {
    const next = !expanded();
    setExpanded(next);
    if (next && members() === null) {
      const detail = await fetchGroup(props.group.id);
      setMembers(detail.members);
    }
  }

  return (
    <div>
      <ListRow
        class={ROW}
        leading={
          <span class="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-accent-txt">
            <MdFillGroup size={20} />
          </span>
        }
        title={
          <A href={href()} class="font-medium hover:underline truncate block">
            {props.group.name}
          </A>
        }
        subtitle={
          <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="tabular-nums">
              {t("directory.member_count", { count: String(props.group.member_count) })}
            </span>
            <Show when={!props.group.visible}>
              <Badge size="sm">{t("directory.private_label")}</Badge>
            </Show>
            <Show when={props.group.is_default_group}>
              <Badge tone="accent" size="sm">{t("directory.default_group")}</Badge>
            </Show>
            <Show when={props.group.is_default_acl}>
              <Badge tone="accent" size="sm">{t("directory.default_acl")}</Badge>
            </Show>
          </span>
        }
        trailing={
          <span class="flex items-center gap-0.5">
            <IconButton
              size="sm"
              label={props.group.is_default_acl ? t("directory.remove_default_acl") : t("directory.set_default_acl")}
              pressed={props.group.is_default_acl}
              onClick={toggleDefaultAcl}
            >
              {props.group.is_default_acl
                ? <MdFillStar size={16} class="text-accent-txt" />
                : <MdFillStar_border size={16} />}
            </IconButton>
            <IconButton
              size="sm"
              label={expanded() ? t("directory.hide_members") : t("directory.view_members")}
              pressed={expanded()}
              onClick={toggleExpanded}
            >
              <MdFillExpand_more size={16} class={`transition-transform ${expanded() ? "rotate-180" : ""}`} />
            </IconButton>
            <Menu label={t("directory.more_actions")} placement="bottom-end" class="w-48">
              <MenuItem icon={<MdOutlineEdit size={16} />} onClick={() => navigate(href())}>
                {t("directory.edit_label")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem danger icon={<MdOutlineDelete size={16} />} onClick={handleDelete} disabled={deleteBusy()}>
                {t("directory.delete_group")}
              </MenuItem>
            </Menu>
          </span>
        }
      />

      <Show when={expanded()}>
        <div class="pl-16 pr-3 pb-3">
          <Show when={members()} fallback={<Spinner size="sm" />}>
            {(list) => (
              <Show
                when={list().length > 0}
                fallback={<p class="text-xs text-muted">{t("directory.no_members")}</p>}
              >
                <ul class="flex flex-wrap gap-1.5">
                  <For each={list()}>
                    {(m) => (
                      <li class="inline-flex items-center gap-1.5 h-7 rounded-lg bg-elevated pl-1 pr-2.5 text-xs text-txt">
                        <Avatar src={m.photo} name={m.name} size={5} />
                        {m.name}
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
};

// ── View ──────────────────────────────────────────────────────────────────────

const PrivacyGroupsView: Component = () => {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = createSignal(false);
  onMount(() => loadGroups());

  return (
    <Section
      title={t("directory.privacy_groups_title")}
      description={t("directory.privacy_groups_desc")}
      actions={[{
        label: t("directory.new_group"),
        icon: MdFillAdd,
        onClick: () => setShowCreate(true),
        primary: true,
      }]}
    >
      <Show
        when={!loading()}
        fallback={
          <div class="space-y-0.5">
            <For each={[1, 2, 3]}>
              {() => (
                <div class="flex items-center gap-3 px-3 py-2">
                  <Skeleton rounded="full" tone="overlay" class="w-10 h-10 shrink-0" />
                  <div class="flex-1 space-y-2">
                    <Skeleton tone="overlay" class="h-3.5 w-1/4" />
                    <Skeleton tone="overlay" class="h-3 w-1/3" />
                  </div>
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show
          when={groups().length > 0}
          fallback={
            <EmptyState
              icon={<MdFillGroup />}
              action={<Button size="sm" onClick={() => setShowCreate(true)}>{t("directory.new_group")}</Button>}
            >
              {t("directory.no_privacy_groups")}
            </EmptyState>
          }
        >
          <div class="space-y-0.5 -mx-3">
            <For each={groups()}>{(g) => <CardShell uuid={`group:${g.hash}`}><GroupRow group={g} /></CardShell>}</For>
          </div>
        </Show>
      </Show>

      <Show when={showCreate()}>
        <CreateDialog onClose={() => setShowCreate(false)} />
      </Show>
    </Section>
  );
};

export default PrivacyGroupsView;
