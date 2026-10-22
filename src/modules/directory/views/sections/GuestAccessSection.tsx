import { createSignal, createEffect, Show, For, batch } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { MdOutlineContent_copy, MdOutlineRefresh, MdOutlineEdit_note } from "solid-icons/md";
import { BiRegularTrash } from "solid-icons/bi";
import SubPageContent from "@/shared/views/SubPageContent";
import {
  fetchTokens, newTokenValue, saveToken, deleteToken,
  type GuestToken,
} from "../../tokens/api";
import { editing, setEditing } from "../../tokens/store";
import { Button, IconButton } from "@ui/Button";
import { Field, Input, Select } from "@ui/Field";
import { cardClass } from "@ui/Card";
import { Badge } from "@ui/Badge";

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
    <SubPageContent
      title={t("guest_access.title") as string}
      description={t("guest_access.description") as string}
      action={
        <Button size="sm" onClick={() => setEditing(0)}>
          {t("guest_access.new_token")}
        </Button>
      }
    >
      <Show when={quota()?.limit != null}>
        <p class="text-xs text-muted">
          {t("guest_access.quota", {
            used: String(quota()!.used),
            limit: String(quota()!.limit),
          })}
        </p>
      </Show>

      <Show when={editing() !== null}>
        <TokenForm
          token={editing() === 0 ? null : (editing() as GuestToken)}
          roles={roles()}
          onDone={() => { setEditing(null); refetch(); }}
        />
      </Show>

      <Show
        when={tokens().length > 0}
        fallback={
          <Show when={!data.loading}>
            <div class="text-center py-16 text-muted text-sm space-y-2">
              <p>{t("guest_access.no_tokens")}</p>
              <p class="text-xs">{t("guest_access.no_tokens_desc")}</p>
            </div>
          </Show>
        }
      >
        <div class="divide-y divide-rim border border-rim rounded-xl overflow-hidden">
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

      <div class="rounded-lg border border-rim p-3 space-y-1">
        <p class="text-xs font-semibold text-txt">{t("guest_access.how_to_use")}</p>
        <p class="text-xs text-muted">{t("guest_access.how_to_use_body")}</p>
      </div>
    </SubPageContent>
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
    <div class="flex items-center gap-3 px-3 py-2.5 bg-surface hover:bg-elevated transition-colors">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-txt truncate">{props.token.name}</span>
          <Show when={props.token.expired}>
            <Badge tone="danger" size="sm">
              {t("guest_access.expired")}
            </Badge>
          </Show>
        </div>
        <span class="text-[0.6875rem] text-muted font-mono truncate block">
          {props.token.guest_addr}
        </span>
      </div>

      <span class="hidden sm:block text-xs text-muted shrink-0">{expiryLabel()}</span>

      <div class="flex items-center gap-1 shrink-0">
        <IconButton label={t("guest_access.login_password") as string} size="sm" onClick={() => {
            navigator.clipboard.writeText(props.token.token)
              .then(() => toast.success(t("share.copied") as string))
              .catch(() => toast.error(t("share.copy_failed") as string));
          }}>
          <MdOutlineContent_copy size={14} />
        </IconButton>
        <IconButton label={t("guest_access.edit_token") as string} size="sm" onClick={props.onEdit}>
          <MdOutlineEdit_note size={14} />
        </IconButton>
        <IconButton
          label={t("guest_access.delete") as string}
          variant="danger"
          size="sm"
          onClick={remove}
          disabled={busy()}
        >
          <BiRegularTrash size={14} />
        </IconButton>
      </div>
    </div>
  );
}

function TokenForm(props: {
  token: GuestToken | null;
  roles: { name: string; label: string }[];
  onDone: () => void;
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
    <form class={`${cardClass()} space-y-3 p-4`} onSubmit={submit}>
      <h2 class="text-sm font-semibold text-txt">
        {props.token ? t("guest_access.edit_token") : t("guest_access.new_token")}
      </h2>

      <div class="space-y-1">
        <Field label={t("guest_access.login_name")} size="sm">
          <Input
          class="w-full"
          type="text"
          required
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          />
        </Field>
      </div>

      <div class="space-y-1">
        <label class="block text-xs text-muted">{t("guest_access.login_password")}</label>
        <div class="flex gap-2">
          <Input
            class="w-full font-mono flex-1 min-w-0"
            type="text"
            required
            value={token()}
            onInput={(e) => setToken(e.currentTarget.value)}
          />
          <IconButton
            label={t("guest_access.regenerate") as string}
            class="shrink-0"
            onClick={() => newTokenValue().then(setToken).catch(() => {})}
          >
            <MdOutlineRefresh size={15} />
          </IconButton>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <Field label={t("guest_access.expires")} size="sm">
            <Input
            class="w-full"
            type="date"
            value={expires()}
            onInput={(e) => setExpires(e.currentTarget.value)}
            />
          </Field>
        </div>
        <div class="space-y-1">
          <Field label={t("guest_access.role")} size="sm">
            <Select class="w-full" value={role()} onChange={(e) => setRole(e.currentTarget.value)}>
            <option value="" />
            <For each={props.roles}>
            {(r) => <option value={r.name}>{r.label}</option>}
            </For>
            </Select>
          </Field>
        </div>
      </div>
      <p class="text-[0.6875rem] text-muted">{t("guest_access.role_hint")}</p>

      <div class="flex gap-2">
        <Button size="sm" type="submit" disabled={saving()}>
          {saving() ? t("guest_access.saving") : t("guest_access.save")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          {t("guest_access.cancel")}
        </Button>
      </div>
    </form>
  );
}
