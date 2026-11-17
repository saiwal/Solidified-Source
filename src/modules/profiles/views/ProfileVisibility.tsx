import { createSignal, For, Show } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { fetchConnections, fetchPermcats } from "@/modules/directory/connections/api";
import { fetchGroups } from "@/modules/directory/groups/api";
import { bulkProfileContacts, fetchProfileContacts, fetchProfiles, toggleProfileContact } from "../api/api";
import { Section } from "@/modules/settings/store/FormHelpers";
import { Card } from "@ui/Card";
import { ListRow } from "@ui/ListRow";
import { Avatar } from "@ui/Avatar";
import { Button, IconButton } from "@ui/Button";
import { SearchField } from "@ui/SearchField";
import { Field, Select } from "@ui/Field";
import { EmptyState } from "@ui/EmptyState";
import { MdOutlineClose } from "solid-icons/md";

/**
 * Which connections see this (non-default) profile — classic /profperm.
 * Assignment is abook_profile, one profile per connection, so adding a
 * connection here moves it off whatever profile it had.
 */
export default function ProfileVisibility(props: { profileId: number }) {
  const { t } = useI18n();
  const [search, setSearch] = createSignal("");
  const [busy, setBusy] = createSignal<number | null>(null);

  const [assigned] = createQueryResource(
    "profile-contacts", () => props.profileId, (id) => fetchProfileContacts(id),
  );
  const [profiles] = createQueryResource("profiles", fetchProfiles);
  const [results] = createQueryResource(
    "profile-contact-search",
    () => search().trim() || null,
    (q) => fetchConnections({ filter: "all", search: q, limit: 10 }).then((r) => r.connections),
  );

  const assignedIds = () => new Set((assigned() ?? []).map((c) => c.abook_id));
  const profileName = (id: number | null) =>
    (profiles()?.profiles ?? []).find((p) => p.id === id)?.profile_name;

  // Bulk source: "role:<name>" or "gid:<id>"
  const [source, setSource] = createSignal("");
  const [bulkBusy, setBulkBusy] = createSignal(false);
  const [roles] = createQueryResource("permcats", () => fetchPermcats().catch(() => []));
  const [groups] = createQueryResource("privacy-groups", () => fetchGroups().catch(() => []));

  async function bulk(mode: "add" | "remove") {
    const [kind, value] = [source().slice(0, source().indexOf(":")), source().slice(source().indexOf(":") + 1)];
    const target = kind === "gid" ? { gid: Number(value) } : { role: value };
    setBulkBusy(true);
    try {
      const dry = await bulkProfileContacts(props.profileId, target, mode, true);
      if (dry.changed === 0) { toast.info(t("profiles.visibility_bulk_none")); return; }
      const ask = mode === "remove"
        ? t("profiles.visibility_bulk_remove_confirm", { count: String(dry.changed) })
        : dry.moved > 0
          ? t("profiles.visibility_bulk_move_confirm", { moved: String(dry.moved), count: String(dry.changed) })
          : null;
      if (ask && !confirm(ask)) return;
      const r = await bulkProfileContacts(props.profileId, target, mode);
      toast.success(t(mode === "add" ? "profiles.visibility_bulk_added" : "profiles.visibility_bulk_removed", { count: String(r.changed) }));
      await Promise.all(["profile-contacts", "profile-contact-search"]
        .map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
    } catch {
      toast.error(t("profiles.visibility_error"));
    } finally {
      setBulkBusy(false);
    }
  }

  async function toggle(abookId: number) {
    setBusy(abookId);
    try {
      await toggleProfileContact(props.profileId, abookId);
      await Promise.all(["profile-contacts", "profile-contact-search"]
        .map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
    } catch {
      toast.error(t("profiles.visibility_error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card class="p-5 space-y-4">
      <Section title={t("profiles.visibility_title")}>
        <p class="text-sm text-muted">{t("profiles.visibility_hint")}</p>

        <Show when={(roles() ?? []).length > 0 || (groups() ?? []).length > 0}>
          <div class="flex flex-wrap items-end gap-2">
            <Field label={t("profiles.visibility_bulk_label")} size="sm" class="flex-1 min-w-48">
              <Select class="w-full" value={source()} onChange={(e) => setSource(e.currentTarget.value)}>
                <option value="">{t("profiles.visibility_bulk_pick")}</option>
                <Show when={(roles() ?? []).length > 0}>
                  <optgroup label={t("profiles.visibility_bulk_roles")}>
                    <For each={roles()}>
                      {(r) => <option value={`role:${r.name}`}>{r.label}{r.count != null ? ` (${r.count})` : ""}</option>}
                    </For>
                  </optgroup>
                </Show>
                <Show when={(groups() ?? []).length > 0}>
                  <optgroup label={t("profiles.visibility_bulk_groups")}>
                    <For each={groups()}>
                      {(g) => <option value={`gid:${g.id}`}>{g.name} ({g.member_count})</option>}
                    </For>
                  </optgroup>
                </Show>
              </Select>
            </Field>
            <div class="flex flex-wrap gap-2">
              <Button size="sm" disabled={!source() || bulkBusy()} onClick={() => bulk("add")}>
                {t("profiles.visibility_bulk_add")}
              </Button>
              <Button size="sm" variant="ghost" disabled={!source() || bulkBusy()} onClick={() => bulk("remove")}>
                {t("profiles.visibility_bulk_remove")}
              </Button>
            </div>
          </div>
        </Show>

        <SearchField
          value={search()}
          onInput={setSearch}
          label={t("profiles.visibility_search")}
          placeholder={t("profiles.visibility_search")}
          clearLabel={t("profiles.visibility_clear")}
        />

        <Show when={search().trim()}>
          <div class="divide-y divide-rim">
            <For each={(results() ?? []).filter((c) => !assignedIds().has(c.id))}>
              {(c) => {
                const other = () => c.profile_id && c.profile_id !== props.profileId ? profileName(c.profile_id) : undefined;
                return (
                  <ListRow
                    leading={<Avatar src={c.photo} name={c.name} />}
                    title={c.name}
                    meta={other() ? `${c.address} · ${t("profiles.visibility_moves", { profile: other()! })}` : c.address}
                    trailing={
                      <Button size="sm" variant="ghost" disabled={busy() === c.id} onClick={() => toggle(c.id)}>
                        {t("profiles.visibility_add")}
                      </Button>
                    }
                  />
                );
              }}
            </For>
          </div>
        </Show>

        <Show
          when={(assigned() ?? []).length > 0}
          fallback={<Show when={assigned()}><EmptyState size="sm">{t("profiles.visibility_empty")}</EmptyState></Show>}
        >
          <div class="divide-y divide-rim">
            <For each={assigned()}>
              {(c) => (
                <ListRow
                  leading={<Avatar src={c.photo} name={c.name} />}
                  title={c.name}
                  meta={c.address}
                  trailing={
                    <IconButton
                      label={t("profiles.visibility_remove", { name: c.name })}
                      variant="danger"
                      disabled={busy() === c.abook_id}
                      onClick={() => toggle(c.abook_id)}
                    >
                      <MdOutlineClose />
                    </IconButton>
                  }
                />
              )}
            </For>
          </div>
        </Show>
      </Section>
    </Card>
  );
}
