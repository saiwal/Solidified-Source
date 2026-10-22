import { createSignal, createMemo, For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminChannels, adminChannelAction } from "../../api";
import type { AdminChannel } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";
import { Badge } from "@ui/Badge";
import { EmptyState } from "@ui/EmptyState";

export default function ChannelsSection() {
  const { t } = useI18n();
  const [page, setPage] = createSignal(0);
  const [search, setSearch] = createSignal("");
  const [result, { refetch }] = createQueryResource("admin-channels", page, fetchAdminChannels);

  const filtered = createMemo(() => {
    const q = search().toLowerCase().trim();
    const data = result()?.data ?? [];
    if (!q) return data;
    return data.filter(
      (ch) =>
        ch.channel_name.toLowerCase().includes(q) ||
        ch.channel_address.toLowerCase().includes(q),
    );
  });

  async function act(
    channel_id: number,
    action: "block" | "unblock" | "allowcode" | "disallowcode" | "delete",
  ) {
    if (action === "delete" && !confirm(t("admin.delete_confirm"))) return;
    await adminChannelAction(channel_id, action);
    refetch();
  }

  return (
    <SubPageContent title={t("admin.channels_title")} description={t("admin.channels_desc")}>
      <Show when={result.error}>
        <div class="rounded-lg border border-danger/40 bg-danger-muted px-4 py-3 text-sm text-danger-txt">
          Error: {String(result.error?.message ?? result.error)}
        </div>
      </Show>

      <Show when={result()} fallback={<Skeleton />}>
        {(r) => (
          <div class="space-y-4">
            {/* Toolbar */}
            <div class="flex items-center gap-3">
              <Input
                class="flex-1"
                type="search"
                placeholder="Filter by name or address…"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
              />
              <span class="text-xs text-muted whitespace-nowrap shrink-0">
                {r().meta.root_count} total
              </span>
            </div>

            {/* Cards */}
            <Show
              when={filtered().length > 0}
              fallback={
                <EmptyState>
                  {search() ? "No channels match your filter." : "No channels found."}
                </EmptyState>
              }
            >
              <div class="space-y-2">
                <For each={filtered()}>
                  {(ch) => <ChannelCard channel={ch} onAct={act} />}
                </For>
              </div>
            </Show>

            {/* Pagination */}
            <div class="flex items-center justify-between pt-1">
              <span class="text-xs text-muted">
                {r().meta.root_count === 0
                  ? "No channels"
                  : `${r().meta.offset + 1}–${r().meta.offset + r().data.length} of ${r().meta.root_count}`}
              </span>
              <div class="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page() === 0}
                  onClick={() => { setPage((p) => p - 1); setSearch(""); }}
                >
                  {t("admin.page_prev")}
                </Button>
                <span class="text-xs text-muted px-1">{page() + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!r().meta.has_more}
                  onClick={() => { setPage((p) => p + 1); setSearch(""); }}
                >
                  {t("admin.page_next")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

// ── Channel card ──────────────────────────────────────────────────────────────

function ChannelCard(props: {
  channel: AdminChannel;
  onAct: (id: number, action: "block" | "unblock" | "allowcode" | "disallowcode" | "delete") => void;
}) {
  const ch = props.channel;
  const initials = ch.channel_name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div class={`rounded-lg border bg-surface px-3 py-2.5 flex items-center gap-3 transition-colors
      ${ch.blocked ? "border-danger/60" : "border-rim"}`}>
      {/* Avatar */}
      <div class={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
        ${ch.blocked
          ? "bg-danger-muted text-danger-txt"
          : "bg-accent/10 text-accent"}`}>
        {initials || "?"}
      </div>

      {/* Identity */}
      <div class="min-w-0 w-40 shrink-0">
        <p class="text-sm font-medium text-txt leading-tight truncate">{ch.channel_name}</p>
        <p class="text-[0.6875rem] text-muted font-mono truncate">@{ch.channel_address}</p>
      </div>

      {/* Badges + dates */}
      <div class="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <Show when={ch.blocked}>
          <Badge tone="danger" size="sm" class="shrink-0">
            Censored
          </Badge>
        </Show>
        <Show when={ch.allowcode}>
          <span class="px-1.5 py-0.5 text-[0.625rem] font-medium rounded-full shrink-0
                       bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            Code
          </span>
        </Show>
        <span class="text-[0.6875rem] text-muted hidden sm:block truncate">
          Created {fmtDate(ch.channel_created)}
        </span>
      </div>

      {/* Actions */}
      <div class="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => props.onAct(ch.channel_id, ch.blocked ? "unblock" : "block")}
        >
          {ch.blocked ? "Uncensor" : "Censor"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => props.onAct(ch.channel_id, ch.allowcode ? "disallowcode" : "allowcode")}
        >
          {ch.allowcode ? "Disallow code" : "Allow code"}
        </Button>
        <Button variant="danger" size="sm" onClick={() => props.onAct(ch.channel_id, "delete")}>
          Delete
        </Button>
      </div>
    </div>
  );
}

function fmtDate(s: string) {
  if (!s || s === "0001-01-01 00:00:00") return "—";
  try { return new Date(s).toLocaleDateString(); } catch { return "—"; }
}

function Skeleton() {
  return (
    <div class="space-y-2 animate-pulse">
      <div class="h-8 rounded-lg border border-rim bg-elevated/30" />
      {Array.from({ length: 6 }, () => (
        <Card class="px-3 py-2.5 flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-elevated shrink-0" />
          <div class="w-40 shrink-0 space-y-1.5">
            <div class="h-3.5 w-28 rounded bg-elevated" />
            <div class="h-2.5 w-20 rounded bg-elevated opacity-60" />
          </div>
          <div class="flex-1" />
          <div class="flex gap-1.5 shrink-0">
            <div class="h-6 w-14 rounded bg-elevated" />
            <div class="h-6 w-18 rounded bg-elevated" />
            <div class="h-6 w-12 rounded bg-elevated" />
          </div>
        </Card>
      ))}
    </div>
  );
}
