import { createSignal, createEffect, Show, For, batch } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { MdOutlineAdd, MdOutlineDelete, MdOutlineEdit, MdOutlineKey, MdOutlineRefresh } from "solid-icons/md";
import {
  fetchTokens, newTokenValue, saveToken, deleteToken,
  type GuestToken,
} from "../../tokens/api";
import { editing, setEditing } from "../../tokens/store";
import { Section, ROW } from "../Section";
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Select } from "@ui/Field";
import { Badge } from "@ui/Badge";
import { Banner } from "@ui/Banner";
import { CopyButton } from "@ui/CopyButton";
import { EmptyState } from "@ui/EmptyState";
import { ListRow } from "@ui/ListRow";
import { Menu, MenuItem, MenuSeparator } from "@ui/Menu";
import { Modal, ModalPanel } from "@ui/Modal";
import { Skeleton } from "@ui/Skeleton";

/**
 * Guest Access — /directory/guest-access.
 *
 * Guest tokens are pseudo-contacts (each carries a real xchan + abook row and
 * is granted access like any connection), so they live with connections and
 * privacy groups rather than in a module of their own.
 */
export default function GuestAccessSection() {
  const { t, locale } = useI18n();

  const [data, { refetch }] = createQueryResource("guest-tokens", fetchTokens);
  const tokens = () => data()?.tokens ?? [];
  const roles  = () => data()?.meta.roles ?? [];
  const quota  = () => data()?.meta.quota;

  return (
    <Section
      title={t("guest_access.title") as string}
      description={t("guest_access.description") as string}
      actions={[
        { label: t("guest_access.new_token"), icon: MdOutlineAdd, onClick: () => setEditing(0), primary: true },
      ]}
    >
      <Show when={quota()?.limit != null}>
        <p class="text-xs text-muted tabular-nums">
          {t("guest_access.quota", {
            used: String(quota()!.used),
            limit: String(quota()!.limit),
          })}
        </p>
      </Show>

      <Show
        when={!data.loading || data()}
        fallback={
          <div class="space-y-0.5">
            <For each={[1, 2]}>
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
          when={tokens().length > 0}
          fallback={
            <EmptyState
              icon={<MdOutlineKey />}
              action={<Button size="sm" onClick={() => setEditing(0)}>{t("guest_access.new_token")}</Button>}
            >
              <p>{t("guest_access.no_tokens")}</p>
              <p class="text-xs">{t("guest_access.no_tokens_desc")}</p>
            </EmptyState>
          }
        >
          <div class="space-y-0.5 -mx-3">
            <For each={tokens()}>
              {(tok) => (
                <TokenRow
                  token={tok}
                  locale={locale()}
                  onEdit={() => setEditing(tok)}
                  onDeleted={refetch}
                />
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Banner title={t("guest_access.how_to_use")}>
        {t("guest_access.how_to_use_body")}
      </Banner>

      <Show when={editing() !== null}>
        <TokenDialog
          token={editing() === 0 ? null : (editing() as GuestToken)}
          roles={roles()}
          onDone={() => { setEditing(null); refetch(); }}
          onClose={() => setEditing(null)}
        />
      </Show>
    </Section>
  );
}

function TokenRow(props: {
  token: GuestToken;
  locale: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = createSignal(false);

  async function remove() {
    if (!confirm(t("guest_access.confirm_delete") as string)) return;
    setBusy(true);
    try {
      await deleteToken(props.token.id);
      toast.success(t("guest_access.deleted") as string);
      queryClient.invalidateQueries({ queryKey: ["guest-tokens"] });
      props.onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (t("guest_access.delete_failed") as string));
    } finally {
      setBusy(false);
    }
  }

  const expiryLabel = () => {
    if (!props.token.expires) return t("guest_access.expires_never");
    const d = new Date(props.token.expires.replace(" ", "T") + "Z");
    return d.toLocaleDateString(props.locale, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <ListRow
      class={ROW}
      leading={
        <span class="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-accent-txt">
          <MdOutlineKey size={18} />
        </span>
      }
      title={
        <span class="flex items-center gap-1.5 min-w-0">
          <span class="font-medium truncate">{props.token.name}</span>
          <Show when={props.token.expired}>
            <Badge tone="danger" size="sm">{t("guest_access.expired")}</Badge>
          </Show>
        </span>
      }
      subtitle={<span class="block truncate">{props.token.guest_addr}</span>}
      meta={<span class="tabular-nums">{t("guest_access.expires")}: {expiryLabel()}</span>}
      trailing={
        <span class="flex items-center gap-0.5">
          <CopyButton
            size="sm"
            value={props.token.token}
            label={t("guest_access.copy_password") as string}
            copiedLabel={t("share.copied") as string}
            onError={() => toast.error(t("share.copy_failed") as string)}
          />
          <Menu label={t("directory.more_actions")} placement="bottom-end" class="w-48">
            <MenuItem icon={<MdOutlineEdit size={16} />} onClick={props.onEdit}>
              {t("guest_access.edit_token")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<MdOutlineDelete size={16} />} onClick={remove} disabled={busy()}>
              {t("guest_access.delete")}
            </MenuItem>
          </Menu>
        </span>
      }
    />
  );
}

function TokenDialog(props: {
  token: GuestToken | null;
  roles: { name: string; label: string }[];
  onDone: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();

  const [name, setName]       = createSignal("");
  const [token, setToken]     = createSignal("");
  const [expires, setExpires] = createSignal("");
  const [role, setRole]       = createSignal("");
  const [saving, setSaving]   = createSignal(false);

  // Seed from the row being edited; a new token gets a server-generated
  // password, matching classic's prefilled new_token() field.
  createEffect(() => {
    const tok = props.token;
    batch(() => {
      setName(tok?.name ?? "");
      setToken(tok?.token ?? "");
      setExpires(tok?.expires ? tok.expires.slice(0, 10) : "");
      setRole(tok?.role ?? "");
    });
    if (!tok) newTokenValue().then(setToken).catch(() => {});
  });

  async function submit(e: Event) {
    e.preventDefault();
    if (saving()) return;
    setSaving(true);
    try {
      await saveToken(props.token?.id ?? null, {
        name: name(),
        token: token(),
        expires: expires(),
        role: role(),
      });
      toast.success(t("guest_access.saved") as string);
      queryClient.invalidateQueries({ queryKey: ["guest-tokens"] });
      props.onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t("guest_access.save_failed") as string));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={props.onClose} dismissOnBackdrop={false}>
      {/* contents: the panel, not the form, is the dialog's flex child. */}
      <form class="contents" onSubmit={submit}>
        <ModalPanel
          size="md"
          title={props.token ? t("guest_access.edit_token") : t("guest_access.new_token")}
          onClose={props.onClose}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={props.onClose}>{t("guest_access.cancel")}</Button>
              <Button size="sm" type="submit" disabled={saving()}>
                {saving() ? t("guest_access.saving") : t("guest_access.save")}
              </Button>
            </>
          }
        >
          <div class="p-4 space-y-4">
            <Field label={t("guest_access.login_name")}>
              <Input
                class="w-full"
                type="text"
                required
                autofocus
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </Field>
            <div class="flex items-end gap-2">
              <Field label={t("guest_access.login_password")} class="flex-1 min-w-0">
                <Input
                  class="w-full"
                  type="text"
                  required
                  value={token()}
                  onInput={(e) => setToken(e.currentTarget.value)}
                />
              </Field>
              <IconButton
                label={t("guest_access.regenerate") as string}
                onClick={() => newTokenValue().then(setToken).catch(() => {})}
              >
                <MdOutlineRefresh size={16} />
              </IconButton>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("guest_access.expires")}>
                <Input
                  class="w-full"
                  type="date"
                  value={expires()}
                  onInput={(e) => setExpires(e.currentTarget.value)}
                />
              </Field>
              <Field label={t("guest_access.role")} hint={t("guest_access.role_hint")}>
                <Select class="w-full" value={role()} onChange={(e) => setRole(e.currentTarget.value)}>
                  <option value="" />
                  <For each={props.roles}>
                    {(r) => <option value={r.name}>{r.label}</option>}
                  </For>
                </Select>
              </Field>
            </div>
          </div>
        </ModalPanel>
      </form>
    </Modal>
  );
}
