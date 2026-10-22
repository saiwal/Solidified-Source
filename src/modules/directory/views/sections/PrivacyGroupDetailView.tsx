// modules/directory/views/sections/PrivacyGroupDetailView.tsx
import {
  createSignal,
  createEffect,
  For,
  Show,
  type Component,
} from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import {
  MdFillVisibility,
  MdFillVisibility_off,
  MdFillStar,
  MdFillStar_border,
  MdFillDelete,
  MdFillSave,
  MdFillPerson_add,
  MdFillPerson_remove,
} from "solid-icons/md";
import SubPageContent from "@/shared/views/SubPageContent";
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
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { EmptyState } from "@ui/EmptyState";

// ── Contact pill ──────────────────────────────────────────────────────────────

const ContactPill: Component<{
  contact: GroupContact;
  inGroup: boolean;
  onToggle: () => void;
  busy: boolean;
}> = (props) => {
  const { t } = useI18n();
  return (
  <button
    onClick={props.onToggle}
    disabled={props.busy}
    title={props.inGroup ? t("directory.remove_from_group") : t("directory.add_to_group")}
    class={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors w-full text-left
      ${props.inGroup
        ? "bg-accent-muted border-accent text-accent"
        : "bg-surface border-rim text-txt hover:bg-elevated"}
      disabled:opacity-50`}
  >
    <img
      src={props.contact.photo}
      alt={props.contact.name}
      class="w-7 h-7 rounded-full shrink-0 object-cover bg-overlay"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
    />
    <span class="flex-1 min-w-0">
      <span class="font-medium truncate block">{props.contact.name}</span>
      <Show when={props.contact.addr}>
        <span class="text-xs text-muted truncate block">{props.contact.addr}</span>
      </Show>
    </span>
    <span class="shrink-0 opacity-70">
      {props.inGroup ? <MdFillPerson_remove size={15} /> : <MdFillPerson_add size={15} />}
    </span>
  </button>
  );
};

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
    if (!q) return allContacts();
    return allContacts().filter(
      (c) => c.name.toLowerCase().includes(q) || c.addr.toLowerCase().includes(q),
    );
  };

  async function saveEdit(e: Event) {
    e.preventDefault();
    setEditBusy(true);
    await updateGroup(parseInt(props.id, 10), { name: name(), visible: visible() });
    setEditBusy(false);
  }

  async function handleDelete(e: Event) {
    e.preventDefault();
    const g = activeGroup()?.group;
    if (!g || !confirm(`Delete group "${g.name}"?`)) return;
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

  async function toggleDefaultAcl(e: Event) {
    e.preventDefault();
    const g = activeGroup()?.group;
    if (!g) return;
    await updateGroup(g.id, { set_default_acl: !g.is_default_acl });
  }

  async function toggleDefaultGroup(e: Event) {
    e.preventDefault();
    const g = activeGroup()?.group;
    if (!g) return;
    await updateGroup(g.id, { set_default_group: !g.is_default_group });
  }

  return (
    <Show
      when={!detailLoading()}
      fallback={
        <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4 animate-pulse">
          <Card class="h-44" />
          <Card class="h-72" />
        </div>
      }
    >
      <Show when={activeGroup()}>
        {(detail) => (
          <>
            <SubPageContent
              title={detail().group.name}
              description={t("directory.group_edit_desc")}
              action={
                <Button onClick={saveEdit} disabled={editBusy()}>
                  <MdFillSave size={15} />
                  {editBusy() ? t("directory.saving") : t("directory.save")}
                </Button>
              }
            >
              <div class="space-y-3">
                <Input
                  class="w-full"
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  placeholder={t("directory.group_name_input")}
                />

                <label class="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={visible()}
                    onChange={(e) => setVisible(e.currentTarget.checked)}
                    class="accent-[var(--accent)]"
                  />
                  {visible()
                    ? <span class="flex items-center gap-1"><MdFillVisibility size={13} />{t("directory.visibility_visible")}</span>
                    : <span class="flex items-center gap-1"><MdFillVisibility_off size={13} />{t("directory.visibility_private")}</span>}
                </label>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    pressed={detail().group.is_default_acl}
                    onClick={toggleDefaultAcl}
                  >
                    {detail().group.is_default_acl ? <MdFillStar size={14} /> : <MdFillStar_border size={14} />}
                    {t("directory.post_to_group_default")}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    pressed={detail().group.is_default_group}
                    onClick={toggleDefaultGroup}
                  >
                    {detail().group.is_default_group ? <MdFillStar size={14} /> : <MdFillStar_border size={14} />}
                    {t("directory.add_connections_default")}
                  </Button>
                </div>

                <div class="pt-2 border-t border-rim">
                  <button
                    onClick={handleDelete}
                    disabled={deleteBusy()}
                    class="flex items-center gap-1.5 text-sm text-danger-txt hover:text-danger-txt
                           disabled:opacity-50 transition-colors"
                  >
                    <MdFillDelete size={15} />
                    {deleteBusy() ? t("directory.deleting") : t("directory.delete")}
                  </button>
                </div>
              </div>
            </SubPageContent>

            <SubPageContent
              title={`${t("directory.members_title")} (${detail().members.length})`}
              description={t("directory.members_desc")}
              action={
                <Input
                  size="sm"
                  class="w-36"
                  type="search"
                  placeholder={t("directory.search_placeholder")}
                  value={search()}
                  onInput={(e) => setSearch(e.currentTarget.value)}
                />
              }
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto">
                <For
                  each={filtered()}
                  fallback={
                    <EmptyState size="sm" class="col-span-2">
                      {t("directory.no_connections_found")}
                    </EmptyState>
                  }
                >
                  {(contact) => (
                    <ContactPill
                      contact={contact}
                      inGroup={memberHashes().has(contact.xchan_hash)}
                      onToggle={() => handleToggle(contact.xchan_hash)}
                      busy={togglingHash() === contact.xchan_hash}
                    />
                  )}
                </For>
              </div>
            </SubPageContent>
          </>
        )}
      </Show>
    </Show>
  );
};

export default PrivacyGroupDetailView;
