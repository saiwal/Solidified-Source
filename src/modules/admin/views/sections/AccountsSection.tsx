import { createSignal, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { MdOutlineClose } from "solid-icons/md";
import SubPageContent from "@/shared/views/SubPageContent";
import {
  fetchAdminAccounts, adminAccountAction, adminPendingAction,
  fetchAdminServiceClasses, setAccountServiceClass, setAccountExpires, setAccountPassword,
} from "../../api";
import type { AdminAccount, AdminPendingAccount } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Select } from "@ui/Field";
import { MenuItem, MenuSeparator } from "@ui/Menu";
import { MenuButton } from "@ui/MenuButton";
import { Sheet } from "@ui/Sheet";
import { Badge } from "@ui/Badge";
import { Banner } from "@ui/Banner";
import { DataTable } from "@ui/DataTable";
import type { DataTableColumn } from "@utsukta/spa-core/types/ui.types";

export default function AccountsSection() {
  const { t } = useI18n();
  const [page, setPage] = createSignal(0);
  const [result, { refetch }] = createQueryResource("admin-accounts", page, fetchAdminAccounts);

  async function act(account_id: number, action: "block" | "unblock" | "delete") {
    if (action === "delete" && !confirm(t("admin.delete_confirm"))) return;
    await adminAccountAction(account_id, action);
    refetch();
  }

  async function pendingAct(reg_id: number, action: "approve" | "deny") {
    try {
      await adminPendingAction(reg_id, action);
      refetch();
    } catch (e) {
      alert(String((e as Error)?.message ?? e));
    }
  }

  return (
    <SubPageContent title={t("admin.accounts_title")} description={t("admin.accounts_desc")} wide>
      <Show when={result.error}>
        <Banner tone="danger" role="alert" class="mb-4">
          Error: {String(result.error?.message ?? result.error)}
        </Banner>
      </Show>

      <Show when={result()} fallback={<Skeleton />}>
        {(r) => (
          <div class="space-y-6">

            {/* ── Pending registrations ── */}
            <Show when={r().pending?.length > 0}>
              <section class="space-y-3">
                <h3 class="text-sm font-semibold text-txt flex items-center gap-2">
                  Pending registrations
                  <Badge tone="warning">
                    {r().pending.length}
                  </Badge>
                </h3>

                <DataTable
                  columns={pendingColumns(pendingAct)}
                  rows={r().pending}
                  rowKey={(reg) => reg.reg_id}
                  class="rounded-lg border border-rim"
                />
              </section>
            </Show>

            {/* ── Account list ── */}
            <section class="space-y-3">
              <p class="text-sm text-muted">
                {r().meta.root_count === 0
                  ? "No accounts"
                  : `Showing ${r().meta.offset + 1}–${r().meta.offset + r().data.length} of ${r().meta.root_count}`}
              </p>

              <DataTable
                columns={accountColumns(t, act, refetch)}
                rows={r().data}
                rowKey={(acc) => acc.account_id}
                class="rounded-lg border border-rim"
              />

              <div class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page() === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("admin.page_prev")}
                </Button>
                <span class="text-sm text-muted">{t("admin.page_label")} {page() + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!r().meta.has_more}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("admin.page_next")}
                </Button>
              </div>
            </section>

          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

type Translate = ReturnType<typeof useI18n>["t"];

function accountColumns(
  t: Translate,
  act: (id: number, action: "block" | "unblock" | "delete") => void,
  refetch: () => void,
): DataTableColumn<AdminAccount>[] {
  return [
    {
      key: "email",
      header: t("admin.col_email"),
      class: "text-txt",
      cell: (acc) => (
        <div class="flex items-center gap-2 min-w-0">
          <span class="truncate" title={acc.account_email}>{acc.account_email}</span>
          <Show when={Number(acc.blocked) > 0}>
            <Badge tone="danger">{t("admin.blocked_badge")}</Badge>
          </Show>
        </div>
      ),
    },
    { key: "channels", header: t("admin.col_channels"), width: 9, class: "text-muted truncate", cell: (acc) => acc.channels || "—" },
    { key: "created", header: t("admin.col_created"), width: 7, class: "text-muted", cell: (acc) => fmtDate(acc.account_created) },
    { key: "lastlog", header: "Last login", width: 7, class: "text-muted", cell: (acc) => fmtDate(acc.account_lastlog) },
    { key: "class", header: t("admin.col_service_class"), width: 8, class: "text-muted truncate", cell: (acc) => acc.account_service_class || "—" },
    { key: "expires", header: t("admin.col_expires"), width: 7, class: "text-muted", cell: (acc) => fmtDate(acc.account_expires) },
    {
      key: "actions",
      header: "",
      width: 8,
      class: "flex justify-end",
      cell: (acc) => <AccountActions account={acc} onAct={act} onEdited={refetch} />,
    },
  ];
}

function pendingColumns(
  pendingAct: (reg_id: number, action: "approve" | "deny") => void,
): DataTableColumn<AdminPendingAccount>[] {
  return [
    {
      key: "email",
      header: "Email",
      class: "text-txt",
      cell: (reg) => (
        <>
          <div class="truncate" title={reg.reg_email}>{reg.reg_email}</div>
          <Show when={reg.msg}>
            <p class="text-xs text-muted">
              <span class="font-medium text-txt">Message:</span> {reg.msg}
            </p>
          </Show>
        </>
      ),
    },
    { key: "requested", header: "Requested", width: 7, class: "text-muted", cell: (reg) => fmtDate(reg.reg_created) },
    { key: "ip", header: "IP", width: 9, class: "text-muted font-mono text-xs truncate", cell: (reg) => reg.reg_atip || "—" },
    {
      key: "status",
      header: "Status",
      width: 7,
      cell: (reg) => (
        <div class="flex flex-wrap gap-1">
          <Show when={reg.unverified}><Badge tone="warning">Unverified</Badge></Show>
          <Show when={reg.expired}><Badge tone="danger">Expired</Badge></Show>
          <Show when={!reg.unverified && !reg.expired}><span class="text-muted">—</span></Show>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      width: 10,
      class: "flex justify-end gap-1.5",
      cell: (reg) => (
        <>
          <Button variant="ghost" size="sm" onClick={() => pendingAct(reg.reg_id, "approve")}>Approve</Button>
          <Button variant="danger" size="sm" onClick={() => pendingAct(reg.reg_id, "deny")}>Deny</Button>
        </>
      ),
    },
  ];
}

function AccountActions(props: {
  account: AdminAccount;
  onAct: (id: number, action: "block" | "unblock" | "delete") => void;
  onEdited: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = createSignal(false);
  const isBlocked = () => Number(props.account.blocked) > 0;
  return (
    <div class="flex items-center">
      <MenuButton label={t("admin.col_actions")} size="sm" variant="ghost" menuClass="w-48">
        <MenuItem onClick={() => props.onAct(props.account.account_id, isBlocked() ? "unblock" : "block")}>
          {isBlocked() ? t("admin.unblock") : t("admin.block")}
        </MenuItem>
        <MenuItem onClick={() => setEditing(true)}>
          {t("admin.edit")}
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger onClick={() => props.onAct(props.account.account_id, "delete")}>
          {t("admin.delete")}
        </MenuItem>
      </MenuButton>
      <Show when={editing()}>
        <AccountEditModal
          account={props.account}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); props.onEdited(); }}
        />
      </Show>
    </div>
  );
}

function toDateInputValue(s: string): string {
  return !s || s === "0001-01-01 00:00:00" ? "" : s.slice(0, 10);
}

function AccountEditModal(props: {
  account: AdminAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [classes] = createQueryResource("admin-service-classes", fetchAdminServiceClasses);
  const [serviceClass, setServiceClass] = createSignal(props.account.account_service_class || "");
  const [expires, setExpires] = createSignal(toDateInputValue(props.account.account_expires));
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  function generatePassword() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const pw = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 14);
    setNewPassword(pw);
    setConfirmPassword(pw);
    setShowPassword(true);
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError("");

    if (newPassword() && newPassword() !== confirmPassword()) {
      setError(t("admin.password_mismatch"));
      return;
    }

    setSaving(true);
    try {
      const origClass = props.account.account_service_class || "";
      const origExpires = toDateInputValue(props.account.account_expires);
      if (serviceClass() !== origClass) {
        await setAccountServiceClass(props.account.account_id, serviceClass());
      }
      if (expires() !== origExpires) {
        await setAccountExpires(props.account.account_id, expires());
      }
      if (newPassword()) {
        await setAccountPassword(props.account.account_id, newPassword());
      }
      props.onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <Sheet
      onClose={props.onClose}
      label={t("admin.edit_account_title")}
      side="right"
      class="p-4 space-y-4"
    >
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-txt">{t("admin.edit_account_title")}</h3>
        <IconButton label={t("layout.close")} size="sm" onClick={props.onClose}>
          <MdOutlineClose size={16} />
        </IconButton>
      </div>

      <form onSubmit={onSubmit} class="space-y-4">
          <div class="space-y-1">
            <Field label={t("admin.service_class_label")}>
              <Select
              class="w-full"
              value={serviceClass()}
              onChange={(e) => setServiceClass(e.currentTarget.value)}
              >
              <option value="">{t("admin.unrestricted_label")}</option>
              <For each={classes()?.classes ?? []}>
              {(c) => (
              <option value={c.name}>
              {c.name}{c.properties.price ? ` (${c.properties.price.toFixed(2)}/mo)` : ""}
              </option>
              )}
              </For>
              </Select>
            </Field>
          </div>

          <div class="space-y-1">
            <label class="text-sm font-medium text-txt">{t("admin.expires_label")}</label>
            <div class="flex items-center gap-2">
              <Input
                class="flex-1"
                type="date"
                value={expires()}
                onInput={(e) => setExpires(e.currentTarget.value)}
              />
              <Show when={expires()}>
                <Button variant="ghost" size="sm" onClick={() => setExpires("")}>
                  {t("admin.clear_expiry")}
                </Button>
              </Show>
            </div>
            <p class="text-xs text-muted">{t("admin.expires_hint")}</p>
          </div>

          <div class="space-y-1 pt-1 border-t border-rim">
            <label class="text-sm font-medium text-txt block pt-3">{t("admin.reset_password_label")}</label>
            <p class="text-xs text-muted">{t("admin.reset_password_hint")}</p>
            <div class="flex items-center gap-2">
              <Input
                class="flex-1"
                type={showPassword() ? "text" : "password"}
                value={newPassword()}
                onInput={(e) => setNewPassword(e.currentTarget.value)}
                placeholder={t("admin.new_password_label")}
                aria-label={t("admin.new_password_label")}
                autocomplete="new-password"
              />
              <Button variant="ghost" size="sm" onClick={() => setShowPassword((v) => !v)}>
                {showPassword() ? t("admin.hide_password") : t("admin.show_password")}
              </Button>
            </div>
            <Show when={newPassword()}>
              <Input
                class="w-full"
                type={showPassword() ? "text" : "password"}
                value={confirmPassword()}
                onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                placeholder={t("admin.confirm_password_label")}
                aria-label={t("admin.confirm_password_label")}
                autocomplete="new-password"
              />
            </Show>
            <Button variant="ghost" size="sm" onClick={generatePassword}>
              {t("admin.generate_password")}
            </Button>
          </div>

          <Show when={error()}>
            <p class="text-xs text-danger-txt">{error()}</p>
          </Show>

          <div class="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={props.onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={saving()}>
              {saving() ? t("admin.saving") : t("admin.save")}
            </Button>
          </div>
        </form>
    </Sheet>
  );
}

function fmtDate(s: string) {
  if (!s || s === "0001-01-01 00:00:00") return "—";
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return "—";
  }
}

function Skeleton() {
  return (
    <div class="space-y-4 animate-pulse">
      <div class="space-y-2">
        <div class="h-4 w-48 rounded bg-elevated" />
        <div class="rounded-lg border border-rim overflow-hidden">
          {Array.from({ length: 3 }, () => (
            <div class="h-10 border-b border-rim bg-elevated/30 last:border-0" />
          ))}
        </div>
      </div>
      <div class="space-y-2">
        <div class="h-4 w-40 rounded bg-elevated" />
        <div class="rounded-lg border border-rim overflow-hidden">
          {Array.from({ length: 5 }, () => (
            <div class="h-10 border-b border-rim bg-elevated/30 last:border-0" />
          ))}
        </div>
      </div>
    </div>
  );
}
