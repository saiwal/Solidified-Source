import { createSignal, For, Show } from "solid-js";
import SubPageContent from "@/shared/views/SubPageContent";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { isAppInstalled } from "@utsukta/spa-core/module-registry";
import {
  fetchBlockedChannels,
  fetchBlockSettings,
  saveBlockSettings,
  blockChannel,
  unblockChannel,
  SUPERBLOCK_APP,
  type BlockedChannel,
  type BlockSettings,
  type BlockUnit,
} from "@utsukta/spa-core/lib/blocklist-api";
import { Button } from "@ui/Button";
import { Input, Select } from "@ui/Field";
import { Toggle } from "@ui/Toggle";
import { Card } from "@ui/Card";
import { Avatar } from "@ui/Avatar";

const UNITS: BlockUnit[] = ["minutes", "hours", "days", "weeks", "months", "years"];

export default function BlockedChannelsSection() {
  const { t, locale } = useI18n();
  const installedApps = useInstalledApps();
  // Everything below 403s without the superblock app; a direct link to this
  // page (the menu entry is hidden) gets a pointer to the app instead.
  const installed = () => isAppInstalled(installedApps(), SUPERBLOCK_APP);

  const [channels, { mutate }] = createQueryResource<BlockedChannel[], boolean>(
    "blocklist",
    installed,
    fetchBlockedChannels,
    { initialValue: [] },
  );
  const [settings, { mutate: mutateSettings }] = createQueryResource<BlockSettings, boolean>(
    "blocklist-settings",
    installed,
    fetchBlockSettings,
  );

  const [addr, setAddr] = createSignal("");
  // 0 = permanent, as in the addon's "leave as 0 to block forever".
  const [amount, setAmount] = createSignal(0);
  const [unit, setUnit] = createSignal<BlockUnit>("days");
  const [adding, setAdding] = createSignal(false);

  async function handleAdd(e: Event) {
    e.preventDefault();
    const value = addr().trim();
    if (!value || adding()) return;
    setAdding(true);
    try {
      await blockChannel(value, amount() > 0 ? { amount: amount(), unit: unit() } : null);
      setAddr("");
      setAmount(0);
      mutate(await fetchBlockedChannels());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(t("blocklist.add_error")));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(hash: string) {
    const prev = channels() ?? [];
    mutate(prev.filter((c) => c.hash !== hash));
    try {
      await unblockChannel(hash);
    } catch (err) {
      mutate(prev);
      toast.error(err instanceof Error ? err.message : String(t("blocklist.remove_error")));
    }
  }

  async function handleSetting(key: keyof BlockSettings, value: boolean) {
    const prev = settings();
    if (prev) mutateSettings({ ...prev, [key]: value });
    try {
      mutateSettings(await saveBlockSettings({ [key]: value }));
    } catch {
      mutateSettings(prev);
      toast.error(String(t("blocklist.settings_error")));
    }
  }

  const untilLabel = (until: string) => {
    const d = new Date(until);
    return d.getTime() <= Date.now()
      ? t("blocklist.expired")
      : t("blocklist.until", { date: d.toLocaleString(locale()) });
  };

  return (
    <SubPageContent
      title={t("settings.title_blocked") as string}
      description={t("settings.desc_blocked") as string}
    >
      <Show when={installed()} fallback={<p class="text-sm text-muted">{t("blocklist.app_required")}</p>}>
        <Show when={settings()}>
          {(s) => (
            <Card class="px-4 divide-y divide-rim">
              <Toggle
                name="block_reshares"
                label={t("blocklist.block_reshares") as string}
                hint={t("blocklist.block_reshares_desc") as string}
                checked={s().block_reshares}
                onChange={(v) => void handleSetting("block_reshares", v)}
              />
              <Toggle
                name="block_incoming"
                label={t("blocklist.block_incoming") as string}
                hint={t("blocklist.block_incoming_desc") as string}
                checked={s().block_incoming}
                onChange={(v) => void handleSetting("block_incoming", v)}
              />
            </Card>
          )}
        </Show>

        <form onSubmit={handleAdd} class="flex flex-wrap gap-2">
          <Input
            class="w-full flex-1 min-w-48"
            type="text"
            value={addr()}
            onInput={(e) => setAddr(e.currentTarget.value)}
            placeholder={t("blocklist.add_placeholder") as string}
          />
          <label class="flex items-center gap-1.5 text-xs text-muted">
            {t("blocklist.block_for")}
            <Input
              class="w-full w-16"
              type="number"
              min="0"
              max="99"
              value={amount()}
              onInput={(e) => setAmount(Math.max(0, Math.min(99, Number(e.currentTarget.value) || 0)))}
              aria-label={t("blocklist.duration_amount") as string}
            />
            <Select
              class="w-full w-auto"
              value={unit()}
              onChange={(e) => setUnit(e.currentTarget.value as BlockUnit)}
              disabled={amount() === 0}
              aria-label={t("blocklist.duration_unit") as string}
            >
              <For each={UNITS}>{(u) => <option value={u}>{t(`blocklist.unit_${u}`)}</option>}</For>
            </Select>
          </label>
          <Button size="sm" type="submit" disabled={!addr().trim() || adding()}>
            {adding() ? t("blocklist.blocking") : t("blocklist.block")}
          </Button>
        </form>
        <p class="text-xs text-muted -mt-2">{t("blocklist.forever_hint")}</p>

        <Show when={channels.loading}>
          <div class="space-y-2 animate-pulse">
            <For each={[1, 2, 3]}>{() => <div class="h-12 bg-elevated rounded-xl" />}</For>
          </div>
        </Show>

        <Show when={!channels.loading && (channels() ?? []).length === 0}>
          <div class="flex flex-col items-center gap-2 py-12 text-muted">
            <p class="text-sm font-medium">{t("blocklist.no_blocked")}</p>
            <p class="text-xs text-center max-w-xs">{t("blocklist.no_blocked_desc")}</p>
          </div>
        </Show>

        <Card class="overflow-hidden divide-y divide-rim">
          <For each={channels()}>
            {(c) => (
              <div class="flex items-center gap-3 px-4 py-3">
                <Show
                  when={c.photo}
                  fallback={
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-txt
                                shrink-0 flex items-center justify-center text-accent-fg text-xs font-bold">
                      {c.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  }
                >
                  <Avatar src={c.photo} size={8} />
                </Show>
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-txt truncate">{c.name}</div>
                  <div class="text-xs text-muted truncate">
                    {c.address}
                    <Show when={c.until}>{(u) => <> · {untilLabel(u())}</>}</Show>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void handleRemove(c.hash)}>
                  {t("blocklist.unblock")}
                </Button>
              </div>
            )}
          </For>
        </Card>
      </Show>
    </SubPageContent>
  );
}
