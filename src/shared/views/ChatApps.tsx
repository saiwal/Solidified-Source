// Matrix / Delta Chat for a contact: the action-row button, and the small
// address editor used by the profile editor (own) and connection editor
// (private, per connection). Server side: Api/ChatAddresses.php.
// Docs: src/docs/dev/en/4-features/chat-apps.md
import { For, Show, createEffect, createSignal } from "solid-js";
import { useQuery } from "@utsukta/spa-core/lib/query";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { currentNick } from "@utsukta/spa-core/store/auth-store";
import { hasMatrixSession, matrixEnabled } from "@/modules/messenger/matrix-session";
import { CHAT_LABEL, normalizeChat, type ChatAddress, type ChatType } from "@utsukta/spa-core/lib/chat-links";
import { Button, IconButton, iconButtonClass } from "@ui/Button";
import { Menu, MenuItem } from "@ui/Menu";
import { Field, Input } from "@ui/Field";
import { MdOutlineForum, MdOutlineLock } from "solid-icons/md";

const TYPES: ChatType[] = ["matrix", "deltachat"];

async function getChatIds(q: string): Promise<ChatAddress[]> {
  const r = await apiFetch(`/spa/chatids?${q}`);
  if (!r.ok) return [];
  return ((await r.json()).data ?? []) as ChatAddress[];
}

/** Matrix opens in Messenger's Matrix tab when the Matrix app is on and this
 *  browser is signed in there; everything else (and Matrix without a session) leaves for the app. */
function linkProps(a: ChatAddress): { href: string; target?: string; rel?: string } {
  if (a.type === "matrix" && currentNick() && matrixEnabled() && hasMatrixSession())
    return { href: `/messenger/${encodeURIComponent(currentNick())}/matrix/dm/${encodeURIComponent(a.value)}` };
  return { href: a.href, target: "_blank", rel: "noopener noreferrer" };
}

/** Chat-app button for a contact; renders nothing until it has an address. */
export function ChatAppsButton(props: { xchan: string | null | undefined; size?: "sm" | "md" }) {
  const { t } = useI18n();
  const q = useQuery(() => ({
    queryKey: ["chatids", props.xchan],
    queryFn: () => getChatIds(`xchan=${encodeURIComponent(props.xchan!)}`),
    enabled: !!props.xchan,
    staleTime: 10 * 60_000,
  }));
  const list = () => q.data ?? [];
  const label = (a: ChatAddress) => t("ui.chat_on", { app: CHAT_LABEL[a.type] });
  const isPrivate = (a: ChatAddress) => a.source === "private" || a.source === "addressbook";

  return (
    <Show when={list().length > 0}>
      <Show
        when={list().length > 1}
        fallback={
          <a
            {...linkProps(list()[0])}
            class={iconButtonClass("outline", props.size ?? "sm")}
            title={`${label(list()[0])}: ${list()[0].value}`}
            aria-label={label(list()[0])}
          >
            <MdOutlineForum size={16} />
          </a>
        }
      >
        <Menu
          label={t("ui.chat_apps")}
          class="w-72"
          trigger={(trigger) => (
            <IconButton {...trigger} label={t("ui.chat_apps")} variant="outline" size={props.size ?? "sm"}>
              <MdOutlineForum size={16} />
            </IconButton>
          )}
        >
          <For each={list()}>
            {(a) => (
              <MenuItem {...linkProps(a)} icon={<MdOutlineForum size={16} />}>
                <span class="flex flex-col min-w-0">
                  <span>{label(a)}</span>
                  <span class="text-xs text-muted truncate flex items-center gap-1">
                    <Show when={isPrivate(a)}>
                      <MdOutlineLock size={12} aria-label={t("ui.chat_private_hint")} />
                    </Show>
                    {a.value}
                  </span>
                </span>
              </MenuItem>
            )}
          </For>
        </Menu>
      </Show>
    </Show>
  );
}

/** Menu entries for a contact's addresses — for an existing ⋯ menu, whose
 *  items mount only while it is open, so a long list fetches nothing up front. */
export function ChatMenuItems(props: { xchan: string }) {
  const { t } = useI18n();
  const q = useQuery(() => ({
    queryKey: ["chatids", props.xchan],
    queryFn: () => getChatIds(`xchan=${encodeURIComponent(props.xchan)}`),
    staleTime: 10 * 60_000,
  }));
  return (
    <For each={q.data ?? []}>
      {(a) => (
        <MenuItem {...linkProps(a)} icon={<MdOutlineForum size={16} />} title={a.value}>
          {t("ui.chat_on", { app: CHAT_LABEL[a.type] })}
        </MenuItem>
      )}
    </For>
  );
}

/**
 * One input per chat app. Without `xchan` it edits your own published
 * addresses; with it, your private entries for that connection.
 */
export function ChatAddressFields(props: { xchan?: string }) {
  const { t } = useI18n();
  const key = () => (props.xchan ? ["chatids", props.xchan] : ["chatids", "self"]);
  const q = useQuery(() => ({
    queryKey: key(),
    queryFn: () => getChatIds(props.xchan ? `xchan=${encodeURIComponent(props.xchan)}` : "self=1"),
    refetchOnWindowFocus: false, // seeds inputs; a refetch would clobber edits
  }));
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    const mine = (q.data ?? []).filter((a) => !props.xchan || a.source === "private");
    setValues(Object.fromEntries(TYPES.map((ty) => [ty, mine.find((a) => a.type === ty)?.value ?? ""])));
  });

  const invalid = (ty: ChatType) => {
    const v = values()[ty]?.trim();
    return v && !normalizeChat(ty, v) ? t("ui.chat_invalid") : null;
  };

  const save = async () => {
    if (TYPES.some(invalid)) return;
    const items = TYPES.filter((ty) => values()[ty]?.trim()).map((ty) => ({ type: ty, value: values()[ty].trim() }));
    setSaving(true);
    try {
      const r = await apiFetch("/spa/chatids", {
        method: "POST",
        body: JSON.stringify(props.xchan ? { xchan: props.xchan, items } : { self: items }),
      });
      if (!r.ok) throw new Error(String(r.status));
      toast.success(t("ui.chat_saved"));
      queryClient.invalidateQueries({ queryKey: ["chatids"] });
    } catch {
      toast.error(t("ui.chat_invalid"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <p class="text-sm text-muted">
        {props.xchan ? t("ui.chat_addresses_private_help") : t("ui.chat_addresses_own_help")}
      </p>
      <For each={TYPES}>
        {(ty) => (
          <Field label={CHAT_LABEL[ty]} error={invalid(ty)}>
            <Input
              value={values()[ty] ?? ""}
              placeholder={t(ty === "matrix" ? "ui.chat_matrix_placeholder" : "ui.chat_deltachat_placeholder")}
              autocomplete="off"
              onInput={(e) => setValues({ ...values(), [ty]: e.currentTarget.value })}
            />
          </Field>
        )}
      </For>
      <div>
        <Button type="button" size="sm" onClick={save} disabled={saving() || TYPES.some(invalid)}>
          {t("ui.chat_save")}
        </Button>
      </div>
    </div>
  );
}
