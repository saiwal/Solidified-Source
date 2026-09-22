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

import Modal from "@/shared/views/Modal";
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
  <MdOutlineCheck class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
);

const CrossIcon = () => (
  <MdOutlineClose class="w-3.5 h-3.5 text-red-400 shrink-0" />
);

function FlagToggle(p: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => p.onChange(!p.active)}
      class={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        p.active
          ? "bg-accent/10 border-accent text-accent"
          : "border-rim text-muted hover:border-rim-strong hover:text-txt"
      }`}
    >
      {p.label}
    </button>
  );
}

function formatDate(iso: string): string {
  if (!iso || iso.startsWith("0001")) return "";
  return new Date(iso.replace(" ", "T") + "Z").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}

export default function ConnectionEditorModal(props: Props) {
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
  const tabCls = (t: Tab) =>
    `flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
      tab() === t
        ? "border-accent text-accent"
        : "border-transparent text-muted hover:text-txt"
    }`;

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
      <div class="w-full max-w-lg rounded-2xl bg-surface border border-rim shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

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
            <img
              src={props.authorAvatar}
              width="40" height="40"
              class="w-10 h-10 rounded-full object-cover ring-1 ring-rim shrink-0"
            />
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
          <button
            onClick={props.onClose}
            class="p-1.5 rounded-lg text-muted hover:text-txt hover:bg-overlay transition-colors shrink-0"
            aria-label={t("connection.close")}
          >
            <MdOutlineClose class="w-4 h-4" />
          </button>
        </div>

        {/* Tab bar */}
        <div class="flex border-b border-rim shrink-0">
          <button class={tabCls("settings")}  onClick={() => setTab("settings")}>
            {t("connection.tab_settings")}
          </button>
          <button class={tabCls("perms")}     onClick={() => setTab("perms")}>
            {t("connection.tab_permissions")}
          </button>
          <button class={tabCls("filters")}   onClick={() => setTab("filters")}>
            {t("connection.tab_filters")}
          </button>
        </div>

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
                    <div class="w-full px-3 py-2 rounded-lg border border-rim bg-surface text-muted text-sm">
                      {t("connection.role_loading")}
                    </div>
                  }
                >
                  <select
                    onChange={(e) => setRole(e.currentTarget.value)}
                    class="w-full px-3 py-2 rounded-lg border border-rim bg-surface text-txt text-sm
                           focus:outline-none hover:border-rim-strong transition-colors"
                  >
                    <option value="" selected={role() === ""}>{t("connection.no_role")}</option>
                    <For each={permcats()}>
                      {(pc) => (
                        <option value={pc.name} selected={pc.name === role()}>
                          {pc.label}
                        </option>
                      )}
                    </For>
                  </select>
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
                  <label class="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                    {t("connection.profile_label")}
                  </label>
                  <select
                    value={profileId() ?? ""}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setProfileId(v === "" ? null : Number(v));
                    }}
                    class="w-full px-3 py-2 rounded-lg border border-rim bg-surface text-txt text-sm
                           focus:outline-none hover:border-rim-strong transition-colors"
                  >
                    <option value="">{t("connection.profile_default")}</option>
                    <For each={extraProfiles()}>
                      {(p) => <option value={String(p.id)}>{p.profile_name}</option>}
                    </For>
                  </select>
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
                  <span class="text-xs px-1.5 py-0.5 rounded bg-accent-muted text-accent font-medium">
                    {t("connection.pending")}
                  </span>
                </Show>
                <For each={props.connection.status.filter(s => !["blocked","ignored","archived","hidden","pending"].includes(s))}>
                  {(s) => (
                    <span class="text-xs px-1.5 py-0.5 rounded bg-overlay text-muted">{s}</span>
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
                  <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {t("connection.perms_loading")}
                </div>
              }
            >
              <Show
                when={permsData()}
                fallback={<p class="py-10 text-center text-sm text-muted">{t("connection.perms_error")}</p>}
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
                  <span class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
                              bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <MdOutlineWarning size={16} class="shrink-0" />
                    <span class="flex-1 min-w-0 text-xs">{t("filters.connfilter_off")}</span>
                    <A
                      href="/settings/features"
                      onClick={props.onClose}
                      class="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium
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
          <button
            onClick={handleDelete}
            disabled={deleting()}
            class={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors
                   disabled:opacity-50 disabled:cursor-default
                   ${confirmDelete()
                     ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                     : "text-muted hover:bg-overlay hover:text-accent"}`}
          >
            <Show when={deleting()}>
              <span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            </Show>
            {confirmDelete()
              ? t("connection.confirm_remove")
              : props.connection.pending
              ? t("connection.reject")
              : t("connection.remove")}
          </button>

          <Show when={props.connection.pending}>
            <button
              onClick={handleApprove}
              disabled={approving()}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-accent text-accent-fg hover:opacity-80 transition-opacity
                     disabled:opacity-50 disabled:cursor-default"
            >
              <Show when={approving()}>
                <span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              </Show>
              {approving() ? t("connection.approving") : t("connection.approve")}
            </button>
          </Show>

          <Show when={tab() === "settings"}>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing()}
              title={t("connection.refresh_perms_hint")}
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border
                     border-rim text-muted hover:border-accent hover:text-accent transition-colors
                     disabled:opacity-50 disabled:cursor-default"
            >
              <MdOutlineRefresh class={`w-3.5 h-3.5 ${refreshing() ? "animate-spin" : ""}`} />
              {refreshing() ? t("connection.refreshing") : t("connection.refresh_perms")}
            </button>
            <Show when={refreshFailed()}>
              <span class="text-[0.6875rem] text-red-500">{t("connection.refresh_error")}</span>
            </Show>
          </Show>

          <div class="flex-1" />

          <button
            onClick={props.onClose}
            class="px-3 py-1.5 rounded-lg text-xs border border-rim text-muted
                   hover:bg-overlay transition-colors"
          >
            {t("connection.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving()}
            class="px-3 py-1.5 rounded-lg text-xs border border-rim text-muted
                   hover:border-accent hover:text-accent transition-colors
                   disabled:opacity-50 disabled:cursor-default flex items-center gap-1.5"
          >
            <Show when={saving()}>
              <span class="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            </Show>
            {saving() ? t("connection.saving") : t("connection.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
