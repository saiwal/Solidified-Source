import { createSignal, createUniqueId, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { Modal } from "@ui/Modal";
import {
  fetchAdminAccounts, adminAccountAction, adminPendingAction,
  fetchAdminServiceClasses, setAccountServiceClass, setAccountExpires, setAccountPassword,
} from "../../api";
import type { AdminAccount } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Field, Input, Select } from "@ui/Field";
import { CardHeader } from "@ui/Card";
import { Badge } from "@ui/Badge";

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
        <div class="rounded-lg border border-danger/40 bg-danger-muted px-4 py-3 text-sm text-danger-txt mb-4">
          Error: {String(result.error?.message ?? result.error)}
        </div>
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

                <div class="rounded-lg border border-rim overflow-x-auto">
                  <table class="w-full text-sm table-fixed">
                    <colgroup>
                      <col class="w-auto" />
                      <col class="hidden sm:table-column sm:w-32" />
                      <col class="hidden md:table-column md:w-32" />
                      <col class="w-32" />
                      <col class="w-40" />
                    </colgroup>
                    <thead>
                      <tr class="border-b border-rim bg-elevated">
                        <th class="px-3 py-2 text-left text-xs font-medium text-muted">Email</th>
                        <th class="px-3 py-2 text-left text-xs font-medium text-muted hidden sm:table-cell">Requested</th>
                        <th class="px-3 py-2 text-left text-xs font-medium text-muted hidden md:table-cell">IP</th>
                        <th class="px-3 py-2 text-left text-xs font-medium text-muted">Status</th>
                        <th class="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      <For each={r().pending}>
                        {(reg) => (
                          <>
                          <tr class="border-b border-rim last:border-0 hover:bg-elevated/50 transition-colors">
                            <td class="px-3 py-2 text-txt truncate">{reg.reg_email}</td>
                            <td class="px-3 py-2 text-muted hidden sm:table-cell">{fmtDate(reg.reg_created)}</td>
                            <td class="px-3 py-2 text-muted font-mono text-xs hidden md:table-cell">{reg.reg_atip || "—"}</td>
                            <td class="px-3 py-2">
                              <div class="flex flex-wrap gap-1">
                                <Show when={reg.unverified}>
                                  <Badge tone="warning">
                                    Unverified
                                  </Badge>
                                </Show>
                                <Show when={reg.expired}>
                                  <Badge tone="danger">
                                    Expired
                                  </Badge>
                                </Show>
                              </div>
                            </td>
                            <td class="px-3 py-2">
                              <div class="flex items-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => pendingAct(reg.reg_id, "approve")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => pendingAct(reg.reg_id, "deny")}
                                >
                                  Deny
                                </Button>
                              </div>
                            </td>
                          </tr>
                          <Show when={reg.msg}>
                            <tr class="border-b border-rim last:border-0">
                              <td colspan="5" class="px-3 pb-2 text-xs text-muted">
                                <span class="font-medium text-txt">Message:</span> {reg.msg}
                              </td>
                            </tr>
                          </Show>
                          </>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </section>
            </Show>

            {/* ── Account list ── */}
            <section class="space-y-3">
              <p class="text-sm text-muted">
                {r().meta.root_count === 0
                  ? "No accounts"
                  : `Showing ${r().meta.offset + 1}–${r().meta.offset + r().data.length} of ${r().meta.root_count}`}
              </p>

              <div class="rounded-lg border border-rim overflow-x-auto">
                <table class="w-full text-sm table-fixed">
                  <colgroup>
                    <col class="w-auto" />
                    <col class="hidden sm:table-column sm:w-28" />
                    <col class="hidden md:table-column md:w-28" />
                    <col class="hidden lg:table-column lg:w-28" />
                    <col class="hidden md:table-column md:w-28" />
                    <col class="hidden lg:table-column lg:w-28" />
                    <col class="w-28" />
                    <col class="w-40" />
                  </colgroup>
                  <thead>
                    <tr class="border-b border-rim bg-elevated">
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted">{t("admin.col_email")}</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted hidden sm:table-cell">{t("admin.col_channels")}</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted hidden md:table-cell">{t("admin.col_created")}</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted hidden lg:table-cell">Last login</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted hidden md:table-cell">{t("admin.col_service_class")}</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted hidden lg:table-cell">{t("admin.col_expires")}</th>
                      <th class="px-3 py-2 text-left text-xs font-medium text-muted">{t("admin.col_status")}</th>
                      <th class="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    <For each={r().data}>
                      {(acc) => (
                        <tr class="border-b border-rim last:border-0 hover:bg-elevated/50 transition-colors">
                          <td class="px-3 py-2 text-txt truncate">{acc.account_email}</td>
                          <td class="px-3 py-2 text-muted hidden sm:table-cell truncate">{acc.channels || "—"}</td>
                          <td class="px-3 py-2 text-muted hidden md:table-cell">{fmtDate(acc.account_created)}</td>
                          <td class="px-3 py-2 text-muted hidden lg:table-cell">{fmtDate(acc.account_lastlog)}</td>
                          <td class="px-3 py-2 text-muted hidden md:table-cell truncate">{acc.account_service_class || "—"}</td>
                          <td class="px-3 py-2 text-muted hidden lg:table-cell">{fmtDate(acc.account_expires)}</td>
                          <td class="px-3 py-2">
                            <Show when={Number(acc.blocked) > 0}>
                              <Badge tone="danger">
                                {t("admin.blocked_badge")}
                              </Badge>
                            </Show>
                          </td>
                          <td class="px-3 py-2">
                            <AccountActions account={acc} onAct={act} onEdited={refetch} />
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>

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

function AccountActions(props: {
  account: AdminAccount;
  onAct: (id: number, action: "block" | "unblock" | "delete") => void;
  onEdited: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = createSignal(false);
  const isBlocked = () => Number(props.account.blocked) > 0;
  return (
    <div class="flex flex-wrap items-center gap-1.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => props.onAct(props.account.account_id, isBlocked() ? "unblock" : "block")}
      >
        {isBlocked() ? t("admin.unblock") : t("admin.block")}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        {t("admin.edit")}
      </Button>
      <Button variant="danger" size="sm" onClick={() => props.onAct(props.account.account_id, "delete")}>
        {t("admin.delete")}
      </Button>
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
  const titleId = createUniqueId();
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
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-50">
      <div class="w-full max-w-sm rounded-xl border border-rim bg-base shadow-xl">
        <CardHeader class="flex items-center justify-between">
          <h3 id={titleId} class="text-sm font-semibold text-txt">{t("admin.edit_account_title")}</h3>
          <button onClick={props.onClose} aria-label={t("layout.close")}
                    class="text-muted hover:text-txt text-lg leading-none">×</button>
        </CardHeader>

        <form onSubmit={onSubmit} class="p-4 space-y-4">
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
              <input
                type={showPassword() ? "text" : "password"}
                value={newPassword()}
                onInput={(e) => setNewPassword(e.currentTarget.value)}
                placeholder={t("admin.new_password_label")}
                autocomplete="new-password"
                class="flex-1 px-3 py-1.5 text-sm rounded-lg border border-rim bg-surface text-txt
                       focus:outline-none focus:border-accent"
              />
              <Button variant="ghost" size="sm" onClick={() => setShowPassword((v) => !v)}>
                {showPassword() ? t("admin.hide_password") : t("admin.show_password")}
              </Button>
            </div>
            <Show when={newPassword()}>
              <input
                type={showPassword() ? "text" : "password"}
                value={confirmPassword()}
                onInput={(e) => setConfirmPassword(e.currentTarget.value)}
                placeholder={t("admin.confirm_password_label")}
                autocomplete="new-password"
                class="w-full px-3 py-1.5 text-sm rounded-lg border border-rim bg-surface text-txt
                       focus:outline-none focus:border-accent"
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
      </div>
    </Modal>
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
