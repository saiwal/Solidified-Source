import { createSignal, createMemo, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import {
  fetchConnections,
  fetchRoleSummary,
  createPermcat,
  deletePermcat,
  updateConnection,
  assignPermcatToGroup,
  setDefaultPermcat,
} from "../../connections/api";
import type { Connection, Permcat } from "../../connections/api";
import { fetchGroups } from "../../groups/api";
import type { PrivacyGroup } from "../../groups/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  MdFillAdd, MdFillExpand_more, MdFillStar, MdFillStar_border,
  MdOutlineBadge, MdOutlineDelete, MdOutlineDrive_file_rename_outline,
  MdOutlineGroups, MdOutlineTune,
} from "solid-icons/md";
import RolePermissionsModal from "./RolePermissionsModal";
import { Section, ROW } from "../Section";
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Select } from "@ui/Field";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { EmptyState } from "@ui/EmptyState";
import { ListRow } from "@ui/ListRow";
import { LoadMore } from "@ui/LoadMore";
import { Menu, MenuItem, MenuSeparator } from "@ui/Menu";
import { Modal, ModalPanel } from "@ui/Modal";
import { Skeleton } from "@ui/Skeleton";
import { Spinner } from "@ui/Spinner";

const PAGE = 50;

/** A row in the roles list; `name: ""` is the "No role" bucket. */
type RoleEntry = Permcat & { count: number };

// Roles changed: this page's counts and the connection editor's role list.
function invalidateRoles() {
  queryClient.invalidateQueries({ queryKey: ["role-summary"] });
  queryClient.invalidateQueries({ queryKey: ["permcats"] });
}

// ── Name dialog (create + rename) ─────────────────────────────────────────────

function NameDialog(props: {
  title: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = createSignal(props.initial ?? "");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    const n = name().trim();
    if (!n) return;
    if (n === props.initial) { props.onClose(); return; }
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(n);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={props.onClose} dismissOnBackdrop={false}>
      {/* contents: the panel, not the form, is the dialog's flex child. */}
      <form class="contents" onSubmit={submit}>
        <ModalPanel
          size="sm"
          title={props.title}
          onClose={props.onClose}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={props.onClose}>{t("directory.cancel")}</Button>
              <Button size="sm" type="submit" disabled={busy() || !name().trim()}>
                <Show when={busy()}><Spinner size="xs" /></Show>
                {props.submitLabel}
              </Button>
            </>
          }
        >
          <div class="p-4">
            <Field label={t("directory.role_name")} error={error() ?? undefined}>
              <Input
                class="w-full"
                autofocus
                type="text"
                placeholder={t("directory.role_name_placeholder")}
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </Field>
          </div>
        </ModalPanel>
      </form>
    </Modal>
  );
}

// ── Members of one role ───────────────────────────────────────────────────────

function RoleMembers(props: {
  role: string;
  roleOptions: { name: string; label: string }[];
}) {
  const { t } = useI18n();
  const [list, setList] = createSignal<Connection[] | null>(null);
  const [total, setTotal] = createSignal(0);
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [busyId, setBusyId] = createSignal<number | null>(null);

  async function load(start = 0) {
    const data = await fetchConnections({ filter: "all", role: props.role, limit: PAGE, start, order: "name" });
    setTotal(data.meta.total);
    setList((prev) => (start ? [...(prev ?? []), ...data.connections] : data.connections));
  }
  void load();

  async function loadMore() {
    setLoadingMore(true);
    try { await load(list()?.length ?? 0); } finally { setLoadingMore(false); }
  }

  // A member moved to another role leaves this list; counts refresh.
  async function changeRole(conn: Connection, role: string) {
    setBusyId(conn.id);
    try {
      await updateConnection(conn.id, { role });
      setList((prev) => prev?.filter((c) => c.id !== conn.id) ?? null);
      setTotal((n) => n - 1);
      invalidateRoles();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div class="pl-12 sm:pl-16 pr-3 pb-3">
      <Show when={list()} fallback={<Spinner size="sm" />}>
        {(rows) => (
          <Show
            when={rows().length > 0}
            fallback={<p class="text-xs text-muted py-1">{t("directory.role_no_members")}</p>}
          >
            <p class="text-xs text-muted pb-1">{t("directory.role_assign_hint")}</p>
            <ul class="space-y-0.5 -mx-3">
              <For each={rows()}>
                {(conn) => (
                  <li>
                    <ListRow
                      class={ROW}
                      leading={<Avatar src={conn.photo} name={conn.name} size={8} />}
                      title={<span class="block truncate">{conn.name}</span>}
                      subtitle={<span class="block truncate">{conn.address || conn.url}</span>}
                      trailing={
                        <Select
                          size="sm"
                          class="w-28 sm:w-36"
                          aria-label={t("directory.field_role")}
                          disabled={busyId() === conn.id}
                          onChange={(e) => changeRole(conn, e.currentTarget.value)}
                        >
                          <For each={props.roleOptions}>
                            {(r) => <option value={r.name} selected={r.name === (conn.role ?? "")}>{r.label}</option>}
                          </For>
                        </Select>
                      }
                    />
                  </li>
                )}
              </For>
            </ul>
            <LoadMore
              hasMore={rows().length < total() && !loadingMore()}
              loading={loadingMore()}
              label={t("directory.load_more")}
              onClick={loadMore}
            />
          </Show>
        )}
      </Show>
    </div>
  );
}

// ── Role row ──────────────────────────────────────────────────────────────────

function RoleRow(props: {
  role: RoleEntry;
  open: boolean;
  onToggle: () => void;
  roleOptions: { name: string; label: string }[];
  onEditPerms: () => void;
  onRename: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = createSignal(false);
  const [picking, setPicking] = createSignal(false);
  const [groups] = createQueryResource("privacy-groups", fetchGroups);
  const custom = () => !props.role.system && props.role.name !== "";

  async function toggleDefault() {
    try {
      await setDefaultPermcat(props.role.name, !props.role.is_default);
    } finally {
      invalidateRoles();
    }
  }

  async function assignToGroup(group: PrivacyGroup) {
    if (!confirm(t("directory.assign_to_group_confirm", { role: props.role.label, group: group.name }))) return;
    setBusy(true);
    try {
      await assignPermcatToGroup(props.role.name, group.id);
      invalidateRoles();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(t("directory.confirm_delete_role", { name: props.role.label }))) return;
    setBusy(true);
    try {
      await deletePermcat(props.role.name);
      invalidateRoles();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ListRow
        class={ROW}
        leading={
          <span class="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-accent-txt">
            <MdOutlineBadge size={20} />
          </span>
        }
        title={
          <button type="button" class="flex items-center gap-1.5 font-medium text-left hover:underline" onClick={props.onToggle}>
            <span class="truncate">{props.role.label}</span>
            <Show when={props.role.is_default}>
              <Badge tone="accent" size="sm">{t("directory.default_role")}</Badge>
            </Show>
          </button>
        }
        subtitle={
          <span class="tabular-nums">
            {props.role.count}{" "}
            {props.role.count === 1 ? t("directory.connection_singular") : t("directory.connections_plural")}
          </span>
        }
        trailing={
          <span class="flex items-center gap-0.5">
            <Show when={props.role.name !== "" && props.role.name !== "default"}>
              <IconButton
                size="sm"
                label={props.role.is_default ? t("directory.remove_default_role") : t("directory.set_default_role")}
                pressed={props.role.is_default}
                onClick={toggleDefault}
              >
                {props.role.is_default
                  ? <MdFillStar size={16} class="text-accent-txt" />
                  : <MdFillStar_border size={16} />}
              </IconButton>
            </Show>
            <IconButton
              size="sm"
              label={props.open ? t("directory.hide_members") : t("directory.view_members")}
              pressed={props.open}
              onClick={props.onToggle}
            >
              <MdFillExpand_more size={16} class={`transition-transform ${props.open ? "rotate-180" : ""}`} />
            </IconButton>
            <Show when={custom()}>
              <Menu
                label={t("directory.more_actions")}
                placement="bottom-end"
                class="w-56 max-h-64 overflow-y-auto"
                // Dismissing the menu (however it happens) drops the group-picker sub-state.
                onOpenChange={(o) => { if (!o) setPicking(false); }}
              >
                <Show
                  when={!picking()}
                  fallback={
                    <>
                      <p class="px-3 py-1.5 text-xs text-muted">{t("directory.assign_to_group")}</p>
                      <Show
                        when={(groups() ?? []).length > 0}
                        fallback={<p class="px-3 py-1.5 text-xs text-muted">{t("directory.no_privacy_groups_short")}</p>}
                      >
                        <For each={groups() ?? []}>
                          {(g) => (
                            <MenuItem onClick={() => assignToGroup(g)} disabled={busy()}>
                              {g.name} <span class="text-muted tabular-nums">({g.member_count})</span>
                            </MenuItem>
                          )}
                        </For>
                      </Show>
                    </>
                  }
                >
                  <MenuItem icon={<MdOutlineTune size={16} />} onClick={props.onEditPerms}>
                    {t("directory.edit_permissions")}
                  </MenuItem>
                  <MenuItem icon={<MdOutlineGroups size={16} />} keepOpen onClick={() => setPicking(true)}>
                    {t("directory.assign_to_group")}
                  </MenuItem>
                  <MenuItem icon={<MdOutlineDrive_file_rename_outline size={16} />} onClick={props.onRename}>
                    {t("directory.rename")}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger icon={<MdOutlineDelete size={16} />} onClick={remove} disabled={busy()}>
                    {t("directory.delete_role")}
                  </MenuItem>
                </Show>
              </Menu>
            </Show>
          </span>
        }
      />
      <Show when={props.open}>
        <RoleMembers role={props.role.name} roleOptions={props.roleOptions} />
      </Show>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function ContactRolesSection() {
  const { t } = useI18n();
  const [summary] = createQueryResource("role-summary", fetchRoleSummary);
  const [openRole, setOpenRole] = createSignal<string | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [renaming, setRenaming] = createSignal<RoleEntry | null>(null);
  const [editingPerms, setEditingPerms] = createSignal<{ name: string; label: string } | null>(null);

  const roles = createMemo<RoleEntry[]>(() => {
    const s = summary();
    if (!s) return [];
    const list = s.roles.map((r) => ({ ...r, count: r.count ?? 0 }));
    return s.unassigned > 0
      ? [...list, { name: "", label: t("directory.no_role"), system: true, is_default: false, count: s.unassigned }]
      : list;
  });

  const roleOptions = createMemo(() => [
    { name: "", label: t("directory.no_role") },
    ...(summary()?.roles ?? []).map((r) => ({ name: r.name, label: r.label })),
  ]);

  async function create(name: string) {
    const role = await createPermcat(name);
    invalidateRoles();
    // Freshly created roles start as a copy of "default" — send the user
    // straight into the permission grid so they can actually customise it.
    setEditingPerms({ name: role.name, label: role.label });
  }

  // Core has no rename: create the new role, then drop the old one, and undo
  // the create if the delete fails so both don't linger.
  async function rename(old: RoleEntry, name: string) {
    const created = await createPermcat(name);
    try {
      await deletePermcat(old.name);
    } catch {
      await deletePermcat(created.name).catch(() => {});
      throw new Error(t("directory.rename_failed"));
    }
    if (openRole() === old.name) setOpenRole(created.name);
    invalidateRoles();
  }

  return (
    <Section
      title={t("directory.contact_roles_title")}
      description={t("directory.contact_roles_desc")}
      actions={[{
        label: t("directory.create_role"),
        icon: MdFillAdd,
        onClick: () => setCreating(true),
        primary: true,
      }]}
    >
      <Show
        when={summary()}
        fallback={
          <div class="space-y-0.5">
            <For each={[1, 2, 3, 4]}>
              {() => (
                <div class="flex items-center gap-3 px-3 py-2">
                  <Skeleton rounded="full" tone="overlay" class="w-10 h-10 shrink-0" />
                  <div class="flex-1 space-y-2">
                    <Skeleton tone="overlay" class="h-3.5 w-1/4" />
                    <Skeleton tone="overlay" class="h-3 w-1/5" />
                  </div>
                </div>
              )}
            </For>
          </div>
        }
      >
        <Show when={roles().length > 0} fallback={<EmptyState>{t("directory.no_roles")}</EmptyState>}>
          <div class="space-y-0.5 -mx-3">
            <For each={roles()}>
              {(role) => (
                <RoleRow
                  role={role}
                  open={openRole() === role.name}
                  onToggle={() => setOpenRole(openRole() === role.name ? null : role.name)}
                  roleOptions={roleOptions()}
                  onEditPerms={() => setEditingPerms({ name: role.name, label: role.label })}
                  onRename={() => setRenaming(role)}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={creating()}>
        <NameDialog
          title={t("directory.create_role")}
          submitLabel={t("directory.create")}
          onSubmit={create}
          onClose={() => setCreating(false)}
        />
      </Show>

      <Show when={renaming()}>
        {(role) => (
          <NameDialog
            title={t("directory.rename")}
            initial={role().label}
            submitLabel={t("directory.save")}
            onSubmit={(name) => rename(role(), name)}
            onClose={() => setRenaming(null)}
          />
        )}
      </Show>

      <Show when={editingPerms()}>
        {(role) => (
          <RolePermissionsModal
            name={role().name}
            label={role().label}
            onClose={() => setEditingPerms(null)}
            onSaved={() => setEditingPerms(null)}
          />
        )}
      </Show>
    </Section>
  );
}
