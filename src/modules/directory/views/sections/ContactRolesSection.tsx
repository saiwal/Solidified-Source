import {
  createSignal,
  createMemo,
  createEffect,
  For,
  Show,
} from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import {
  fetchConnections,
  fetchPermcats,
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
import { MdFillAdd, MdFillClose, MdOutlineEdit, MdFillStar, MdFillStar_border } from "solid-icons/md";
import ConnectionEditorModal from "@/shared/views/ConnectionEditorModal";
import RolePermissionsModal from "./RolePermissionsModal";
import SubPageContent from "@/shared/views/SubPageContent";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";
import { useDropdown } from "@utsukta/spa-core/lib/useDropdown";

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchAllConnections(): Promise<Connection[]> {
  const limit = 50;
  const all: Connection[] = [];
  let offset = 0;
  while (offset < 500) {
    const data = await fetchConnections({ filter: "all", limit, start: offset });
    all.push(...data.connections);
    if (all.length >= data.meta.total || data.connections.length < limit) break;
    offset += limit;
  }
  return all;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NETWORK_LABELS: Record<string, string> = {
  zot6:        "Zot",
  activitypub: "AP",
  rss:         "RSS",
};

// ── Inline create-role form ───────────────────────────────────────────────────

function CreateRoleForm(props: {
  onCreated: (role: Permcat) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [newName, setNewName] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  async function handleCreate(e: Event) {
    e.preventDefault();
    const name = newName().trim();
    if (!name) return;
    setBusy(true);
    try {
      const role = await createPermcat(name);
      props.onCreated(role);
      setNewName("");
      props.onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="rounded-lg border border-accent/30 bg-accent/5 p-3">
      <form onSubmit={handleCreate} class="flex gap-2">
        <input
          autofocus
          type="text"
          placeholder={t("directory.role_name_placeholder")}
          value={newName()}
          onInput={(e) => setNewName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Escape" && props.onDone()}
          class="flex-1 text-sm px-3 py-1.5 rounded-lg border border-rim bg-surface text-txt
                 focus:outline-none focus:border-accent hover:border-rim-strong"
        />
        <button
          type="submit"
          disabled={busy() || !newName().trim()}
          class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-sm font-medium
                 disabled:opacity-50 hover:opacity-90 transition-opacity shrink-0"
        >
          {busy() ? t("directory.creating_role") : t("directory.create_role")}
        </button>
        <button
          type="button"
          onClick={props.onDone}
          class="p-1.5 rounded-lg text-muted hover:text-txt hover:bg-overlay transition-colors shrink-0"
        >
          <MdFillClose size={16} />
        </button>
      </form>
    </div>
  );
}

// ── Custom role split-button pill ─────────────────────────────────────────────

function CustomRolePill(props: {
  name: string;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  onDeleted: (name: string) => void;
  onRenamed: (oldName: string, newPermcat: Permcat) => void;
  onEditPerms: (name: string, label: string) => void;
  onBulkAssigned: () => void;
}) {
  const { t } = useI18n();
  const { open, setOpen, toggle, floatStyle, setTriggerRef, setPanelRef } =
    useDropdown({ placement: "bottom-start", offset: 4 });
  const [picking, setPicking] = createSignal(false);
  const [renaming, setRenaming] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [renameError, setRenameError] = createSignal<string | null>(null);
  const [groups] = createQueryResource("privacy-groups", fetchGroups);

  function closeMenu() {
    setOpen(false);
  }

  // Dismissing the menu (however it happens) drops the group-picker sub-state.
  createEffect(() => {
    if (!open()) setPicking(false);
  });

  async function handleAssignToGroup(group: PrivacyGroup) {
    if (!confirm(t("directory.assign_to_group_confirm", { role: props.label, group: group.name }))) return;
    closeMenu();
    setBusy(true);
    try {
      await assignPermcatToGroup(props.name, group.id);
      props.onBulkAssigned();
    } finally {
      setBusy(false);
    }
  }

  function startRename() {
    setOpen(false);
    setNewName(props.label);
    setRenameError(null);
    setRenaming(true);
  }

  async function commitRename(e: Event) {
    e.preventDefault();
    const name = newName().trim();
    if (!name || name === props.label) { setRenaming(false); return; }
    setBusy(true);
    setRenameError(null);
    try {
      const created = await createPermcat(name);
      try {
        await deletePermcat(props.name);
      } catch {
        // Rollback the just-created permcat so we don't leave both behind
        await deletePermcat(created.name).catch(() => {});
        throw new Error("Delete old role failed — rename reverted");
      }
      props.onRenamed(props.name, created);
      setRenaming(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setOpen(false);
    if (!confirm(`Delete role "${props.label}"?`)) return;
    setBusy(true);
    try {
      await deletePermcat(props.name);
      props.onDeleted(props.name);
    } finally {
      setBusy(false);
    }
  }

  const activeBase = "bg-accent text-accent-fg border-accent";
  const idleBase   = "bg-overlay text-muted border-rim";
  const divider    = () => props.active ? "bg-white/20" : "bg-rim";

  return (
    <div class="relative">
      <Show
        when={!renaming()}
        fallback={
          <div class="flex flex-col gap-1">
            <form
              onSubmit={commitRename}
              class={`flex items-center rounded-full border overflow-hidden bg-surface ${
                renameError() ? "border-red-400" : "border-accent"
              }`}
            >
              <input
                autofocus
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
                class="text-sm px-3 py-1 bg-transparent text-txt w-28 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy()}
                class="px-2 py-1 text-xs text-accent hover:bg-overlay transition-colors disabled:opacity-50"
              >
                ✓
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                class="px-2 py-1 text-xs text-muted hover:bg-overlay transition-colors"
              >
                ×
              </button>
            </form>
            <Show when={renameError()}>
              <p class="text-xs text-red-500 px-1">{renameError()}</p>
            </Show>
          </div>
        }
      >
        <div class={`flex items-center rounded-full text-sm border transition-colors overflow-hidden ${
          props.active ? activeBase : idleBase
        }`}>
          {/* Filter side */}
          <button
            onClick={props.onSelect}
            disabled={busy()}
            class="flex items-center gap-1.5 px-3 py-1 disabled:opacity-50"
          >
            {props.label}
            <span class={`text-xs font-medium tabular-nums ${props.active ? "opacity-80" : ""}`}>
              {props.count}
            </span>
          </button>

          {/* Divider */}
          <div class={`w-px self-stretch ${divider()}`} />

          {/* Dropdown trigger */}
          <button
            ref={setTriggerRef}
            onClick={toggle}
            disabled={busy()}
            class={`px-1.5 py-1 transition-colors disabled:opacity-50 ${
              props.active ? "hover:bg-white/10" : "hover:bg-surface"
            }`}
            aria-label="Role actions"
          >
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </Show>

      {/* Dropdown menu */}
      <Portal mount={topLayer()}>
      <Show when={open()}>
        <div
          ref={setPanelRef}
          style={floatStyle()}
          class="bg-surface border border-rim rounded-lg shadow-lg z-50 py-1 min-w-[160px] max-h-64 overflow-y-auto"
        >
          <Show
            when={!picking()}
            fallback={
              <>
                <div class="px-3 py-1.5 text-xs text-muted border-b border-rim">
                  {t("directory.assign_to_group")}
                </div>
                <Show
                  when={(groups() ?? []).length > 0}
                  fallback={
                    <div class="px-3 py-1.5 text-xs text-muted">
                      {t("directory.no_privacy_groups_short")}
                    </div>
                  }
                >
                  <For each={groups() ?? []}>
                    {(g) => (
                      <button
                        onClick={() => handleAssignToGroup(g)}
                        disabled={busy()}
                        class="w-full text-left px-3 py-1.5 text-xs text-txt hover:bg-overlay transition-colors disabled:opacity-50"
                      >
                        {g.name} <span class="text-muted">({g.member_count})</span>
                      </button>
                    )}
                  </For>
                </Show>
              </>
            }
          >
            <button
              onClick={() => { setOpen(false); props.onEditPerms(props.name, props.label); }}
              class="w-full text-left px-3 py-1.5 text-xs text-txt hover:bg-overlay transition-colors"
            >
              {t("directory.edit_permissions")}
            </button>
            <button
              onClick={() => setPicking(true)}
              class="w-full text-left px-3 py-1.5 text-xs text-txt hover:bg-overlay transition-colors"
            >
              {t("directory.assign_to_group")}
            </button>
            <button
              onClick={startRename}
              class="w-full text-left px-3 py-1.5 text-xs text-txt hover:bg-overlay transition-colors"
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              class="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-overlay transition-colors"
            >
              Delete
            </button>
          </Show>
        </div>
      </Show>
      </Portal>
    </div>
  );
}

// ── Connection card with inline role selector ─────────────────────────────────

function RoleCard(props: {
  conn: Connection;
  roleOptions: { name: string; label: string }[];
  onRoleChanged: (newRole: string) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const [editOpen, setEditOpen] = createSignal(false);
  const { t } = useI18n();
  const networkLabel = () => NETWORK_LABELS[props.conn.network] ?? props.conn.network;

  async function handleRoleChange(e: Event) {
    const select = e.currentTarget as HTMLSelectElement;
    const newRole = select.value;
    if (newRole === (props.conn.role ?? "")) return;
    setBusy(true);
    await updateConnection(props.conn.id, { role: newRole });
    setBusy(false);
    props.onRoleChanged(newRole);
  }

  return (
    <>
    <div class="rounded-lg border border-rim bg-surface flex items-center gap-3 p-3">
      <a href={props.conn.url} target="_blank" rel="noopener" class="shrink-0">
        <img
          src={props.conn.photo}
          alt={props.conn.name}
          class="w-11 h-11 rounded-full object-cover ring-1 ring-rim bg-overlay"
        />
      </a>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <a
            href={props.conn.url}
            target="_blank"
            rel="noopener"
            class="font-medium text-sm text-txt truncate hover:underline"
          >
            {props.conn.name}
          </a>
          <span class="shrink-0 text-xs px-1.5 py-0.5 rounded font-medium bg-accent-muted text-accent">
            {networkLabel()}
          </span>
          <Show when={props.conn.is_forum}>
            <span class="shrink-0 text-xs px-1.5 py-0.5 rounded font-medium bg-accent-muted text-accent">
              {t("directory.forum")}
            </span>
          </Show>
        </div>
        <p class="text-xs text-muted truncate mt-0.5">
          {props.conn.address || props.conn.url}
        </p>
      </div>

      {/* Role selector */}
      <select
        onChange={handleRoleChange}
        disabled={busy()}
        class="text-xs px-2 py-1.5 rounded-lg border border-rim bg-surface text-txt
               focus:outline-none hover:border-rim-strong transition-colors
               disabled:opacity-50 shrink-0"
      >
        <For each={props.roleOptions}>
          {(r) => (
            <option value={r.name} selected={r.name === (props.conn.role ?? "")}>
              {r.label}
            </option>
          )}
        </For>
      </select>

      <button
        onClick={() => setEditOpen(true)}
        class="p-1.5 rounded text-muted hover:text-txt hover:bg-overlay transition-colors shrink-0"
        title={t("directory.edit")}
      >
        <MdOutlineEdit size={14} />
      </button>
    </div>

    <Show when={editOpen()}>
      <ConnectionEditorModal
        connection={props.conn}
        authorName={props.conn.name}
        authorAvatar={props.conn.photo}
        onSaved={() => { setEditOpen(false); props.onDeleted(); }}
        onClose={() => setEditOpen(false)}
        onDeleted={() => { setEditOpen(false); props.onDeleted(); }}
      />
    </Show>
    </>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div class="space-y-2 animate-pulse">
      <For each={Array(6).fill(0)}>
        {() => (
          <div class="rounded-lg border border-rim bg-surface p-3 flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-overlay shrink-0" />
            <div class="flex-1 space-y-2">
              <div class="h-3.5 bg-overlay rounded w-1/3" />
              <div class="h-3 bg-overlay rounded w-1/2" />
            </div>
            <div class="h-7 w-24 bg-overlay rounded-lg shrink-0" />
          </div>
        )}
      </For>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

type RolePill = {
  name: string | null;
  label: string;
  count: number;
  system: boolean;
  is_default: boolean;
};

export default function ContactRolesSection() {
  const { t } = useI18n();
  const [connections, { mutate: mutateConns, refetch: refetchConns }] = createQueryResource("connections-all", fetchAllConnections);
  const [permcats, { mutate: mutatePermcats, refetch: refetchPermcats }] = createQueryResource("permcats", fetchPermcats);
  const [activeRole, setActiveRole] = createSignal<string | null>(null);
  const [showCreate, setShowCreate] = createSignal(false);
  const [editingPerms, setEditingPerms] = createSignal<{ name: string; label: string } | null>(null);

  const roleOptions = createMemo<{ name: string; label: string }[]>(() => {
    const cats = permcats() ?? [];
    return [
      { name: "", label: "No role" },
      ...cats.map((p) => ({ name: p.name, label: p.label })),
    ];
  });

  const rolePills = createMemo<RolePill[]>(() => {
    const data = connections() ?? [];
    const cats = permcats() ?? [];

    const counts = new Map<string, number>();
    for (const c of data) {
      const key = c.role ?? "";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const noRoleCount = counts.get("") ?? 0;

    return [
      { name: null,  label: "All",     count: data.length,  system: true, is_default: false },
      ...(noRoleCount > 0
        ? [{ name: "" as string | null, label: "No role", count: noRoleCount, system: true, is_default: false }]
        : []),
      ...cats.map((p) => ({
        name:       p.name as string | null,
        label:      p.label,
        count:      counts.get(p.name) ?? 0,
        system:     p.system,
        is_default: p.is_default,
      })),
    ];
  });

  const selected = createMemo(() => activeRole());

  const filtered = createMemo(() => {
    const data = connections() ?? [];
    const sel = selected();
    if (sel === null) return data;
    return data.filter((c) => (c.role ?? "") === sel);
  });

  function handleRoleChanged(conn: Connection, newRole: string) {
    mutateConns((prev) =>
      prev?.map((c) => (c.id === conn.id ? { ...c, role: newRole } : c))
    );
  }

  function handlePermcatCreated(role: Permcat) {
    mutatePermcats((prev) => [...(prev ?? []), role]);
    // Freshly created roles start as a copy of "default" — send the user
    // straight into the permission grid so they can actually customize it.
    setEditingPerms({ name: role.name, label: role.label });
  }

  function handlePermcatDeleted(name: string) {
    mutatePermcats((prev) => (prev ?? []).filter((p) => p.name !== name));
    mutateConns((prev) => prev?.map((c) => c.role === name ? { ...c, role: "default" } : c));
    if (activeRole() === name) setActiveRole(null);
  }

  function handlePermcatRenamed(oldName: string, newPermcat: Permcat) {
    mutatePermcats((prev) => prev?.map((p) => p.name === oldName ? newPermcat : p));
    mutateConns((prev) => prev?.map((c) => c.role === oldName ? { ...c, role: newPermcat.name } : c));
    if (activeRole() === oldName) setActiveRole(newPermcat.name);
  }

  async function handleToggleDefault(name: string, wasDefault: boolean) {
    const next = !wasDefault;
    mutatePermcats((prev) => prev?.map((p) => ({ ...p, is_default: p.name === name ? next : false })));
    try {
      await setDefaultPermcat(name, next);
    } catch {
      refetchPermcats();
    }
  }

  return (
    <SubPageContent
      title={t("directory.contact_roles_title")}
      description={t("directory.contact_roles_desc")}
      action={
        <button
          onClick={() => setShowCreate((v) => !v)}
          class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            showCreate()
              ? "border-accent text-accent bg-accent/10"
              : "border-rim text-muted hover:border-rim-strong hover:text-txt"
          }`}
        >
          <MdFillAdd size={15} />
          {t("directory.create_role")}
        </button>
      }
    >
      {/* Create form */}
      <Show when={showCreate()}>
        <CreateRoleForm
          onCreated={handlePermcatCreated}
          onDone={() => setShowCreate(false)}
        />
      </Show>

      {/* Connection list */}
      <Show when={!connections.loading} fallback={<Skeleton />}>
        <Show
          when={(connections() ?? []).length > 0}
          fallback={
            <p class="py-8 text-center text-sm text-muted">No connections found.</p>
          }
        >
          {/* Role filter pills — custom roles get a split button */}
          <div class="flex flex-wrap gap-1.5">
            <For each={rolePills()}>
              {(pill) => (
                <div class="flex items-center gap-1">
                  <Show
                    when={!pill.system && pill.name !== null && pill.name !== ""}
                    fallback={
                      <button
                        onClick={() => setActiveRole(pill.name)}
                        class={`px-3 py-1 rounded-full text-sm transition-colors flex items-center gap-1.5 ${
                          selected() === pill.name
                            ? "bg-accent text-accent-fg"
                            : "bg-overlay text-muted hover:bg-surface"
                        }`}
                      >
                        {pill.label}
                        <span class={`text-xs font-medium tabular-nums ${
                          selected() === pill.name ? "opacity-80" : "text-muted"
                        }`}>
                          {pill.count}
                        </span>
                      </button>
                    }
                  >
                    <CustomRolePill
                      name={pill.name!}
                      label={pill.label}
                      count={pill.count}
                      active={selected() === pill.name}
                      onSelect={() => setActiveRole(pill.name)}
                      onDeleted={handlePermcatDeleted}
                      onRenamed={handlePermcatRenamed}
                      onEditPerms={(name, label) => setEditingPerms({ name, label })}
                      onBulkAssigned={() => refetchConns()}
                    />
                  </Show>
                  <Show when={pill.name && pill.name !== "default"}>
                    <button
                      onClick={() => handleToggleDefault(pill.name!, pill.is_default)}
                      title={pill.is_default ? t("directory.remove_default_role") : t("directory.set_default_role")}
                      class="text-muted hover:text-accent transition-colors shrink-0"
                    >
                      {pill.is_default
                        ? <MdFillStar size={15} class="text-accent" />
                        : <MdFillStar_border size={15} />}
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>

          <p class="text-sm text-muted">
            {filtered().length} connection{filtered().length !== 1 ? "s" : ""}
            {selected() !== null && (
              <> — {t("directory.role_assign_hint")}</>
            )}
          </p>

          <div class="space-y-2">
            <For each={filtered()}>
              {(conn) => (
                <RoleCard
                  conn={conn}
                  roleOptions={roleOptions()}
                  onRoleChanged={(newRole) => handleRoleChanged(conn, newRole)}
                  onDeleted={() => refetchConns()}
                />
              )}
            </For>
          </div>
        </Show>
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
    </SubPageContent>
  );
}
