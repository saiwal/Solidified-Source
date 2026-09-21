// Inbox ▸ Rules — one read-only list of every message filter that decides what
// reaches this channel. Rules live in two unrelated places (a channel-wide
// pconfig pair and abook_incl/abook_excl per connection) and core applies both
// at delivery, so there was nowhere to see them together.
//
// Editing stays in the editors that already own each rule: Settings ▸ Channel
// for the channel-wide pair, ConnectionEditorModal's Filters tab for a
// connection's. Nothing here writes.
import { For, Show, createMemo, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isFeatureEnabled } from "@utsukta/spa-core/store/auth-store";
import { parse, type FilterCond } from "@utsukta/spa-core/lib/filter-dsl";
import { MdOutlineFilter_alt, MdOutlineWarning } from "solid-icons/md";
import { fetchConnections, type Connection } from "@/modules/directory/connections/api";
import ConnectionEditorModal from "@/shared/views/ConnectionEditorModal";

interface Rule {
  kind: "incl" | "excl";
  expr: string;
}

const EDIT_BTN =
  "shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-overlay text-muted " +
  "hover:bg-elevated hover:text-txt transition-colors";

function rulesOf(incl?: string, excl?: string): Rule[] {
  return [
    ...(incl?.trim() ? [{ kind: "incl" as const, expr: incl.trim() }] : []),
    ...(excl?.trim() ? [{ kind: "excl" as const, expr: excl.trim() }] : []),
  ];
}

/** Conditions as chips, falling back to the raw expression when it can't be parsed. */
function RuleRow(props: { rule: Rule; action: any }) {
  const { t } = useI18n();
  const parsed = createMemo(() => parse(props.rule.expr));
  const label = (c: FilterCond) =>
    [
      t(`filters.field_${c.field}` as any),
      c.op === "is" ? "" : t(`filters.op_${c.op}` as any),
      c.op === "any" ? "" : c.value,
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div class="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2">
      <span
        class={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[0.625rem] font-semibold uppercase tracking-wide ${
          props.rule.kind === "incl"
            ? "bg-emerald-500/10 text-emerald-500"
            : "bg-red-500/10 text-red-500"
        }`}
      >
        {t(props.rule.kind === "incl" ? "filters.rule_keep" : "filters.rule_skip")}
      </span>

      <Show
        when={parsed()}
        fallback={<code class="flex-1 min-w-0 text-xs font-mono text-muted break-all">{props.rule.expr}</code>}
      >
        {(p) => (
          <span class="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
            <For each={p().conds}>
              {(c, i) => (
                <>
                  <Show when={i() > 0}>
                    <span class="text-[0.625rem] uppercase text-muted">
                      {t(p().join === "all" ? "filters.join_and" : "filters.join_or")}
                    </span>
                  </Show>
                  <span class="px-2 py-0.5 rounded-md bg-overlay text-xs text-txt">{label(c)}</span>
                </>
              )}
            </For>
          </span>
        )}
      </Show>

      {props.action}
    </div>
  );
}

export default function RulesPane() {
  const { t } = useI18n();
  const [editing, setEditing] = createSignal<Connection | null>(null);

  // Same cache entries the settings sections use, so a save over there is
  // reflected here without a second source of truth.
  const channel = useQuery(() => ({
    queryKey: ["settings", "channel"] as const,
    queryFn: async () => (await (await apiFetch("/spa/settings/channel")).json()).data,
  }));
  const conns = useQuery(() => ({
    queryKey: ["connections", "filtered"] as const,
    queryFn: () => fetchConnections({ filter: "filtered", limit: 200 }),
  }));

  const channelRules = createMemo(() =>
    rulesOf(channel.data?.message_filter_incl, channel.data?.message_filter_excl),
  );
  const connRules = createMemo(() =>
    (conns.data?.connections ?? [])
      .map((c) => ({ conn: c, rules: rulesOf(c.incl, c.excl) }))
      .filter((r) => r.rules.length),
  );
  const total = createMemo(
    () => channelRules().length + connRules().reduce((n, r) => n + r.rules.length, 0),
  );

  return (
    <div class="flex-1 min-w-0 overflow-y-auto p-4 space-y-5">
      <header class="flex items-center gap-2">
        <MdOutlineFilter_alt size={18} class="text-muted" />
        <h2 class="text-sm font-semibold text-txt">{t("filters.rules_title")}</h2>
      </header>
      <p class="text-xs text-muted">{t("filters.rules_desc")}</p>

      <section class="rounded-xl border border-rim bg-surface">
        <header class="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-rim">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("filters.scope_channel")}
          </h3>
          <A href="/settings/channel" class={EDIT_BTN}>{t("filters.edit")}</A>
        </header>
        <div class="px-3.5 divide-y divide-rim">
          <Show
            when={channelRules().length}
            fallback={<p class="py-3 text-xs text-muted">{t("filters.rules_empty_channel")}</p>}
          >
            <For each={channelRules()}>{(r) => <RuleRow rule={r} action={null} />}</For>
          </Show>
        </div>
      </section>

      <section class="rounded-xl border border-rim bg-surface">
        <header class="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-rim">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("filters.scope_connections")}
          </h3>
        </header>

        {/* Core skips abook_incl/abook_excl entirely unless the feature is on,
            so a rule listed here would otherwise look active while doing nothing. */}
        <Show when={connRules().length && !isFeatureEnabled("connfilter")}>
          <div class="flex flex-wrap items-center gap-2 px-3.5 py-2 border-b border-rim
                      bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <MdOutlineWarning size={16} class="shrink-0" />
            <span class="flex-1 min-w-0 text-xs">{t("filters.connfilter_off")}</span>
            <A href="/settings/features" class={EDIT_BTN}>{t("filters.connfilter_enable")}</A>
          </div>
        </Show>

        <div class="px-3.5 divide-y divide-rim">
          <Show
            when={connRules().length}
            fallback={<p class="py-3 text-xs text-muted">{t("filters.rules_empty_conn")}</p>}
          >
            <For each={connRules()}>
              {(entry) => (
                <div class="py-2">
                  <div class="flex items-center gap-2">
                    <img src={entry.conn.photo} alt="" class="w-5 h-5 rounded-full shrink-0" />
                    <span class="min-w-0 truncate text-sm text-txt">{entry.conn.name}</span>
                    <span class="min-w-0 truncate text-xs text-muted">{entry.conn.address}</span>
                  </div>
                  <div class="pl-7 divide-y divide-rim">
                    <For each={entry.rules}>
                      {(r, i) => (
                        <RuleRow
                          rule={r}
                          action={
                            <Show when={i() === 0}>
                              <button type="button" class={EDIT_BTN} onClick={() => setEditing(entry.conn)}>
                                {t("filters.edit")}
                              </button>
                            </Show>
                          }
                        />
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </section>

      <Show when={!total() && !channel.isLoading && !conns.isLoading}>
        <p class="text-xs text-muted">{t("filters.rules_none")}</p>
      </Show>

      <Show when={editing()}>
        {(c) => (
          <ConnectionEditorModal
            connection={c()}
            authorName={c().name}
            authorAvatar={c().photo}
            initialTab="filters"
            onClose={() => setEditing(null)}
            onDeleted={() => { setEditing(null); void conns.refetch(); }}
            onSaved={() => void conns.refetch()}
          />
        )}
      </Show>
    </div>
  );
}
