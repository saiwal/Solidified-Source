// modules/directory/views/sections/PrivacyGroupDetailView.tsx
import {
  createSignal,
  createEffect,
  For,
  Show,
  type Component,
} from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { MdOutlineDelete, MdFillSave } from "solid-icons/md";
import {
  activeGroup,
  detailLoading,
  loadGroup,
  updateGroup,
  toggleMember,
  deleteGroup,
} from "../../groups/store";
import { fetchAvailableContacts } from "../../groups/api";
import type { GroupContact } from "../../groups/api";
import { Section, ROW } from "../Section";
import { Field, Input } from "@ui/Field";
import { SearchField } from "@ui/SearchField";
import { Toggle, Switch } from "@ui/Toggle";
import { Tabs } from "@ui/Tabs";
import { Avatar } from "@ui/Avatar";
import { ListRow } from "@ui/ListRow";
import { EmptyState } from "@ui/EmptyState";
import { Menu, MenuItem } from "@ui/Menu";
import { Skeleton } from "@ui/Skeleton";

// ── Detail view ───────────────────────────────────────────────────────────────

interface Props {
  id: string;
  onDeleted: () => void;
}

const PrivacyGroupDetailView: Component<Props> = (props) => {
  const { t } = useI18n();
  const [name, setName] = createSignal("");
  const [visible, setVisible] = createSignal(false);
  const [editBusy, setEditBusy] = createSignal(false);
  const [deleteBusy, setDeleteBusy] = createSignal(false);
  const [available, setAvailable] = createSignal<GroupContact[]>([]);
  const [togglingHash, setTogglingHash] = createSignal<string | null>(null);
  const [search, setSearch] = createSignal("");
  const [membersOnly, setMembersOnly] = createSignal(false);

  // Reload whenever the id prop changes
  createEffect(() => {
    const id = parseInt(props.id, 10);
    if (!id) return;
    loadGroup(id).then(() => {
      const g = activeGroup();
      if (g) {
        setName(g.group.name);
        setVisible(g.group.visible);
      }
    });
    fetchAvailableContacts(id).then(setAvailable).catch(() => {});
  });

  const memberHashes = () =>
    new Set((activeGroup()?.members ?? []).map((m) => m.xchan_hash));

  const allContacts = () => {
    const members = activeGroup()?.members ?? [];
    const av = available();
    const seen = new Set(members.map((m) => m.xchan_hash));
    // Sorted by name so a contact doesn't jump when it's added to or removed from the group.
    return [...members, ...av.filter((c) => !seen.has(c.xchan_hash))].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  };

  const filtered = () => {
    const q = search().toLowerCase();
    const inGroup = memberHashes();
    return allContacts().filter((c) =>
      (!membersOnly() || inGroup.has(c.xchan_hash)) &&
      (!q || c.name.toLowerCase().includes(q) || c.addr.toLowerCase().includes(q)));
  };

  async function saveEdit() {
    setEditBusy(true);
    await updateGroup(parseInt(props.id, 10), { name: name(), visible: visible() });
    setEditBusy(false);
  }

  async function handleDelete() {
    const g = activeGroup()?.group;
    if (!g || !confirm(t("directory.confirm_delete_group", { name: g.name }))) return;
    setDeleteBusy(true);
    await deleteGroup(g.id);
    props.onDeleted();
  }

  async function handleToggle(hash: string) {
    const id = parseInt(props.id, 10);
    setTogglingHash(hash);
    await toggleMember(id, hash);
    fetchAvailableContacts(id).then(setAvailable).catch(() => {});
    setTogglingHash(null);
  }

  const groupId = () => parseInt(props.id, 10);
  const toggleDefaultAcl = (on: boolean) => updateGroup(groupId(), { set_default_acl: on });
  const toggleDefaultGroup = (on: boolean) => updateGroup(groupId(), { set_default_group: on });

  return (
    <Show
      when={!detailLoading()}
      fallback={
        <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4">
          <Skeleton class="h-8 w-1/3" />
          <Skeleton class="h-40" />
          <Skeleton class="h-72" />
        </div>
      }
    >
      <Show when={activeGroup()}>
        {(detail) => (
          <Section
            narrow
            title={detail().group.name}
            description={t("directory.group_edit_desc")}
            tools={
              <Menu label={t("directory.more_actions")} placement="bottom-end" class="w-48">
                <MenuItem danger icon={<MdOutlineDelete size={16} />} onClick={handleDelete} disabled={deleteBusy()}>
                  {deleteBusy() ? t("directory.deleting") : t("directory.delete_group")}
                </MenuItem>
              </Menu>
            }
            actions={[{
              label: editBusy() ? t("directory.saving") : t("directory.save"),
              icon: MdFillSave,
              onClick: saveEdit,
              disabled: editBusy(),
              primary: true,
            }]}
          >
            {/* ── Settings ── */}
            <div class="space-y-4">
              <Field label={t("directory.group_name_input")}>
                <Input
                  class="w-full"
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); }}
                />
              </Field>
              <Toggle
                label={t("directory.members_visible")}
                checked={visible()}
                onChange={setVisible}
              />
              <Toggle
                label={t("directory.post_to_group_default")}
                checked={detail().group.is_default_acl}
                onChange={toggleDefaultAcl}
              />
              <Toggle
                label={t("directory.add_connections_default")}
                checked={detail().group.is_default_group}
                onChange={toggleDefaultGroup}
              />
            </div>

            {/* ── Members ── */}
            <div class="pt-4 space-y-3">
              <div>
                <h2 class="text-sm font-semibold text-txt">
                  {t("directory.members_title")}{" "}
                  <span class="text-muted font-normal tabular-nums">{detail().members.length}</span>
                </h2>
                <p class="text-xs text-muted">{t("directory.members_desc")}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Tabs
                  variant="segmented"
                  label={t("directory.members_title")}
                  value={membersOnly() ? "members" : "all"}
                  onChange={(v) => setMembersOnly(v === "members")}
                  items={[
                    { value: "all", label: t("directory.filter_all") },
                    { value: "members", label: t("directory.in_group") },
                  ]}
                />
                <SearchField
                  size="sm"
                  class="flex-1 min-w-[10rem]"
                  value={search()}
                  onInput={setSearch}
                  label={t("directory.search_placeholder")}
                  clearLabel={t("ui.clear")}
                  placeholder={t("directory.search_placeholder")}
                />
              </div>
              <div class="space-y-0.5 -mx-3">
                <For
                  each={filtered()}
                  fallback={<EmptyState size="sm">{t("directory.no_connections_found")}</EmptyState>}
                >
                  {(contact) => (
                    <ListRow
                      class={ROW}
                      leading={<Avatar src={contact.photo} name={contact.name} size={8} />}
                      title={<span class="block truncate">{contact.name}</span>}
                      subtitle={contact.addr ? <span class="block truncate">{contact.addr}</span> : undefined}
                      trailing={
                        <Switch
                          label={memberHashes().has(contact.xchan_hash) ? t("directory.remove_from_group") : t("directory.add_to_group")}
                          checked={memberHashes().has(contact.xchan_hash)}
                          disabled={togglingHash() === contact.xchan_hash}
                          onChange={() => handleToggle(contact.xchan_hash)}
                        />
                      }
                    />
                  )}
                </For>
              </div>
            </div>
          </Section>
        )}
      </Show>
    </Show>
  );
};

export default PrivacyGroupDetailView;
