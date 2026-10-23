import { isolate } from "@utsukta/spa-core/lib/isolate";
import { createSignal, createResource, createEffect, For, Show, createUniqueId } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import type { Connection } from "@/modules/directory/connections/api";
import {
  updateConnection, deleteConnection, refreshConnection, approveConnection,
  fetchPermcats, fetchConnectionPerms, fetchConnectionGroups,
} from "@/modules/directory/connections/api";
import { fetchGroups } from "@/modules/directory/groups/api";
import { toggleMember } from "@/modules/directory/groups/api";
import { fetchProfiles } from "@/modules/profiles/api/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import FilterRuleBuilder from "./FilterRuleBuilder";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { MdOutlineCheck, MdOutlineClose, MdOutlineRefresh, MdOutlineWarning } from "solid-icons/md";
import { A } from "@solidjs/router";

import { Modal, ModalPanel } from "@ui/Modal";
import { Button, IconButton } from "@ui/Button";
import { Field, Select } from "@ui/Field";
import { Card } from "@ui/Card";
import { Spinner } from "@ui/Spinner";
import { Badge } from "@ui/Badge";
import { Avatar } from "@ui/Avatar";
import { EmptyState } from "@ui/EmptyState";
import { Tabs } from "@ui/Tabs";
interface Props {
  connection: Connection;
  authorName: string;
  authorAvatar?: string;
  onClose: () => void;
  onDeleted: () => void;
  onSaved?: () => void;
  /** Tab to open on — the inbox rules list deep-links straight to "filters". */
  initialTab?: Tab;
}

type Tab = "settings" | "perms" | "filters";

const CheckIcon = () => (
  <MdOutlineCheck class="w-3.5 h-3.5 text-success-txt shrink-0" />
);

const CrossIcon = () => (
  <MdOutlineClose class="w-3.5 h-3.5 text-danger-txt shrink-0" />
);

function FlagToggle(p: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <Button variant="ghost" size="sm" pressed={p.active} onClick={() => p.onChange(!p.active)}>
      {p.label}
    </Button>
  );
}

function formatDate(iso: string): string {
  if (!iso || iso.startsWith("0001")) return "";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

function ConnectionEditorModal(props: Props) {
  const { t } = useI18n();
  const [tab, setTab] = createSignal<Tab>(props.initialTab ?? "settings");
  const [role, setRole] = createSignal(props.connection.role ?? "");
  const [closeness, setCloseness] = createSignal(props.connection.closeness ?? 80);
  const [blocked, setBlocked] = createSignal(props.connection.status.includes("blocked"));
  const [ignored, setIgnored] = createSignal(props.connection.status.includes("ignored"));
  const [archived, setArchived] = createSignal(props.connection.status.includes("archived"));
  const [hidden, setHidden] = createSignal(props.connection.status.includes("hidden"));
  const [incl, setIncl] = createSignal("");
  const [excl, setExcl] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [approving, setApproving] = createSignal(false);

  const [profileId, setProfileId] = createSignal<number | null>(props.connection.profile_id ?? null);

  const [checkedGroupIds, setCheckedGroupIds] = createSignal<Set<number>>(new Set());
  let initialGroupIds = new Set<number>();

  const [privacyGroups] = createQueryResource("privacy-groups", async () => {
    try { return await fetchGroups(); }
    catch { return []; }
  });

  const [profilesResult] = createQueryResource("profiles", async () => {
    try { return await fetchProfiles(); }
    catch { return null; }
  });

  // Only show the profile selector when multi-profiles are enabled and there are non-default profiles
  const extraProfiles = () =>
    (profilesResult()?.profiles ?? []).filter((p) => !p.is_default);

  const [connectionGroupIds] = createQueryResource(
    "connection-groups",
    () => props.connection.id,
    async (id) => {
      try { return await fetchConnectionGroups(id); }
      catch { return []; }
    },
  );

  createEffect(() => {
    const ids = connectionGroupIds();
    if (ids !== undefined) {
      initialGroupIds = new Set(ids);
      setCheckedGroupIds(new Set(ids));
    }
  });

  const [permcats] = createQueryResource("permcats", () => fetchPermcats().catch(() => []));
  const [permsData, { refetch: refetchPerms }] = createResource(
    () => props.connection.id,
    (id) => fetchConnectionPerms(id).then((d) => {
      setIncl(d.incl ?? "");
      setExcl(d.excl ?? "");
      return d;
    }).catch(() => null),
  );

  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshFailed, setRefreshFailed] = createSignal(false);

  const connectedOn = () => formatDate(props.connection.connected);

  async function handleSave() {
    setSaving(true);
    try {
      await updateConnection(props.connection.id, {
        role: role(),
        closeness: closeness(),
        blocked: blocked(),
        ignored: ignored(),
        archived: archived(),
        hidden: hidden(),
        incl: incl(),
        excl: excl(),
        profile_id: profileId(),
      });

      const current = checkedGroupIds();
      const allGroups = privacyGroups() ?? [];
      for (const group of allGroups) {
        const wasIn = initialGroupIds.has(group.id);
        const isIn = current.has(group.id);
        if (wasIn !== isIn) {
          await toggleMember(group.id, props.connection.xchan_hash);
        }
      }

      props.onSaved?.();
      props.onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      await refreshConnection(props.connection.id);
      await refetchPerms();
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await approveConnection(props.connection.id);
      props.onSaved?.();
      props.onClose();
    } finally {
      setApproving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete()) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await deleteConnection(props.connection.id);
      props.onDeleted();
      props.onClose();
    } finally {
      setDeleting(false);
    }
  }


  const titleId = createUniqueId();
  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-[60]">
      <ModalPanel size="lg" class="overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div class="flex items-center gap-3 p-4 border-b border-rim shrink-0">
          <Show
            when={props.authorAvatar}
            fallback={
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-txt
                          shrink-0 flex items-center justify-center text-accent-fg text-sm font-bold">
                {props.authorName[0]?.toUpperCase() ?? "?"}
              </div>
            }
          >
            <Avatar src={props.authorAvatar} size={10} class="ring-1 ring-rim" />
          </Show>
          <div class="flex-1 min-w-0">
            <a id={titleId}
              href={`/chanview?f=&hash=${encodeURIComponent(props.connection.xchan_hash)}`}
              class="font-semibold text-sm text-txt truncate hover:underline block"
            >
              {props.authorName}
            </a>
            <div class="text-xs text-muted truncate">{props.connection.address}</div>
          </div>
          <IconButton label={t("connection.close")} size="sm" class="shrink-0" onClick={props.onClose}>
            <MdOutlineClose class="w-4 h-4" />
          </IconButton>
        </div>

        {/* Tab bar */}
        <Tabs
          variant="underline"
          class="px-4 pt-2 border-b border-rim shrink-0"
          label={props.authorName}
          value={tab()}
          onChange={setTab}
          items={[
            { value: "settings", label: t("connection.tab_settings") },
            { value: "perms", label: t("connection.tab_permissions") },
            { value: "filters", label: t("connection.tab_filters") },
          ]}
        />

        {/* Tab body — scrollable */}
        <div class="flex-1 overflow-y-auto">

          {/* ── Settings tab ─────────────────────────────────────────── */}
          <Show when={tab() === "settings"}>
            <div class="p-4 space-y-5">

              {/* Role (permcat dropdown) */}
              <div>
                <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  {t("connection.role")}
                </label>
                <Show
                  when={!permcats.loading}
                  fallback={
                    <Card class="w-full px-3 py-2 text-muted text-sm">
                      {t("connection.role_loading")}
                    </Card>
                  }
                >
                  <Select class="w-full" onChange={(e) => setRole(e.currentTarget.value)}>
                    <option value="" selected={role() === ""}>{t("connection.no_role")}</option>
                    <For each={permcats()}>
                      {(pc) => (
                        <option value={pc.name} selected={pc.name === role()}>
                          {pc.label}
                        </option>
                      )}
                    </For>
                  </Select>
                </Show>
              </div>

              {/* Closeness */}
              <div>
                <div class="flex items-center justify-between text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                  <span>{t("connection.closeness")}</span>
                  <span class="text-txt tabular-nums font-medium normal-case">{closeness()}</span>
                </div>
                <input
                  type="range" min="0" max="99" step="1"
                  value={closeness()}
                  onInput={(e) => setCloseness(Number(e.currentTarget.value))}
                  class="w-full accent-accent"
                  list="closeness-ticks"
                />
                <datalist id="closeness-ticks">
                  <option value="0" />
                  <option value="25" />
                  <option value="50" />
                  <option value="75" />
                  <option value="99" />
                </datalist>
                {/* Labels aligned to slider thumb positions (mx-[8px] ≈ half thumb inset) */}
                <div class="relative h-4 mt-0.5 mx-[8px]">
                  <span class="absolute left-0 text-[0.625rem] text-muted leading-none">{t("connection.aff_me")}</span>
                  <span class="absolute left-[25%] -translate-x-1/2 text-[0.625rem] text-muted leading-none">{t("connection.aff_family")}</span>
                  <span class="absolute left-1/2 -translate-x-1/2 text-[0.625rem] text-muted leading-none">{t("connection.aff_friends")}</span>
                  <span class="absolute left-[75%] -translate-x-1/2 text-[0.625rem] text-muted leading-none">{t("connection.aff_acquaintances")}</span>
                  <span class="absolute right-0 text-[0.625rem] text-muted leading-none">{t("connection.aff_all")}</span>
                </div>
              </div>

              {/* Status flags */}
              <div>
                <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Status</p>
                <div class="flex flex-wrap gap-2">
                  <FlagToggle label={t("connection.flag_blocked")}  active={blocked()}  onChange={setBlocked} />
                  <FlagToggle label={t("connection.flag_ignored")}  active={ignored()}  onChange={setIgnored} />
                  <FlagToggle label={t("connection.flag_archived")} active={archived()} onChange={setArchived} />
                  <FlagToggle label={t("connection.flag_hidden")}   active={hidden()}   onChange={setHidden} />
                </div>
              </div>

              {/* Privacy Groups */}
              <Show when={(privacyGroups() ?? []).length > 0}>
                <div>
                  <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                    {t("connection.privacy_groups")}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <For each={privacyGroups()}>
                      {(group) => (
                        <FlagToggle
                          label={group.name}
                          active={checkedGroupIds().has(group.id)}
                          onChange={(v) =>
                            setCheckedGroupIds((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(group.id);
                              else next.delete(group.id);
                              return next;
                            })
                          }
                        />
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Profile assignment — only when multi-profiles are active */}
              <Show when={extraProfiles().length > 0}>
                <div>
                  <Field label={t("connection.profile_label")} size="sm">
                    <Select class="w-full" value={profileId() ?? ""} onChange={(e) => {
                    const v = e.currentTarget.value;
                    setProfileId(v === "" ? null : Number(v));
                    }}>
                    <option value="">{t("connection.profile_default")}</option>
                    <For each={extraProfiles()}>
                    {(p) => <option value={String(p.id)}>{p.profile_name}</option>}
                    </For>
                    </Select>
                  </Field>
                </div>
              </Show>

              {/* Meta */}
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <Show when={connectedOn()}>
                  <div class="text-xs text-muted">
                    {t("connection.connected")} <span class="text-txt">{connectedOn()}</span>
                  </div>
                </Show>
                <Show when={props.connection.pending}>
                  <Badge tone="accent">
                    {t("connection.pending")}
                  </Badge>
                </Show>
                <For each={props.connection.status.filter(s => !["blocked","ignored","archived","hidden","pending"].includes(s))}>
                  {(s) => (
                    <Badge>{s}</Badge>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* ── Permissions tab ───────────────────────────────────────── */}
          <Show when={tab() === "perms"}>
            <Show
              when={!permsData.loading}
              fallback={
                <div class="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                  <Spinner size="md" />
                  {t("connection.perms_loading")}
                </div>
              }
            >
              <Show
                when={permsData()}
                fallback={<EmptyState>{t("connection.perms_error")}</EmptyState>}
              >
                {(data) => (
                  <table class="w-full text-xs">
                    <thead class="sticky top-0 bg-surface z-10">
                      <tr class="border-b border-rim">
                        <th class="text-left px-4 py-2.5 font-semibold text-muted uppercase tracking-wide text-[0.625rem]">
                          Permission
                        </th>
                        <th class="px-3 py-2.5 text-center font-semibold text-muted uppercase tracking-wide text-[0.625rem] w-16">
                          {t("connection.perms_their")}
                        </th>
                        <th class="px-3 py-2.5 text-center font-semibold text-muted uppercase tracking-wide text-[0.625rem] w-16">
                          {t("connection.perms_my")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={data().perms}>
                        {(perm) => (
                          <tr class="border-b border-rim/50 hover:bg-overlay/40 transition-colors">
                            <td class="px-4 py-2 text-txt leading-snug">{perm.label}</td>
                            <td class="px-3 py-2 text-center">
                              <div class="flex justify-center">
                                {perm.their ? <CheckIcon /> : <CrossIcon />}
                              </div>
                            </td>
                            <td class="px-3 py-2 text-center">
                              <div class="flex justify-center">
                                {perm.my ? <CheckIcon /> : <CrossIcon />}
                              </div>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                )}
              </Show>
            </Show>
          </Show>

          {/* ── Filters tab ───────────────────────────────────────────── */}
          <Show when={tab() === "filters"}>
            <Show
              when={!permsData.loading}
              fallback={
                <div class="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                  <Spinner size="md" />
                  {t("connection.perms_loading")}
                </div>
              }
            >
              <div class="p-4 space-y-4">
                {/* post_is_importable() skips the whole abook loop unless this
                    feature is on, so without the warning these rules look
                    active while core ignores them. */}
                <Show when={!isFeatureEnabled("connfilter")}>
                  <div class="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg
                              bg-warning/10 text-warning-txt">
                    <MdOutlineWarning size={16} class="shrink-0" />
                    <span class="flex-1 min-w-0 text-xs">{t("filters.connfilter_off")}</span>
                    <A
                      href="/settings/features"
                      onClick={props.onClose}
                      class="shrink-0 px-2.5 py-1 rounded-lg text-xs font-medium
                             bg-overlay text-muted hover:bg-elevated hover:text-txt transition-colors"
                    >
                      {t("filters.connfilter_enable")}
                    </A>
                  </div>
                </Show>
                <div>
                  <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                    {t("connection.filter_incl")}
                  </label>
<FilterRuleBuilder value={incl()} onChange={setIncl} />
                  <p class="text-[0.625rem] text-muted mt-1">{t("connection.filter_incl_hint")}</p>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                    {t("connection.filter_excl")}
                  </label>
<FilterRuleBuilder value={excl()} onChange={setExcl} />
                  <p class="text-[0.625rem] text-muted mt-1">{t("connection.filter_excl_hint")}</p>
                </div>
              </div>
            </Show>
          </Show>

        </div>

        {/* Footer */}
        <div class="flex items-center gap-2 px-4 py-3 border-t border-rim shrink-0">
          <Button
            variant={confirmDelete() ? "danger" : "ghost"}
            size="sm"
            onClick={handleDelete}
            disabled={deleting()}
          >
            <Show when={deleting()}>
              <Spinner size="xs" />
            </Show>
            {confirmDelete()
              ? t("connection.confirm_remove")
              : props.connection.pending
              ? t("connection.reject")
              : t("connection.remove")}
          </Button>

          <Show when={props.connection.pending}>
            <Button size="sm" onClick={handleApprove} disabled={approving()}>
              <Show when={approving()}>
                <Spinner size="xs" />
              </Show>
              {approving() ? t("connection.approving") : t("connection.approve")}
            </Button>
          </Show>

          <Show when={tab() === "settings"}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing()}
              title={t("connection.refresh_perms_hint")}
            >
              <MdOutlineRefresh class={`w-3.5 h-3.5 ${refreshing() ? "animate-spin" : ""}`} />
              {refreshing() ? t("connection.refreshing") : t("connection.refresh_perms")}
            </Button>
            <Show when={refreshFailed()}>
              <span class="text-[0.6875rem] text-danger-txt">{t("connection.refresh_error")}</span>
            </Show>
          </Show>

          <div class="flex-1" />

          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("connection.cancel")}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSave} disabled={saving()}>
            <Show when={saving()}>
              <Spinner size="xs" />
            </Show>
            {saving() ? t("connection.saving") : t("connection.save")}
          </Button>
        </div>
      </ModalPanel>
    </Modal>
  );
}

// Own boundary: its data reads would otherwise suspend the page it opens over.
export default isolate(ConnectionEditorModal);
