import { createSignal, createMemo, For, Show, batch, onMount, onCleanup, type JSX } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import SubPageContent from "@/shared/views/SubPageContent";
import { fetchAdminLogs, saveLogSettings } from "../../api";
import type { AdminLogs, LogEntry, LogLevel } from "../../types";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";

const POLL_MS = 3000;
const MAX_ENTRIES = 2000; // client-side cap while live-tailing

const LOG_LEVELS = [
  { key: "lvl_normal", value: 0 },
  { key: "lvl_trace",  value: 1 },
  { key: "lvl_debug",  value: 2 },
  { key: "lvl_data",   value: 3 },
  { key: "lvl_all",    value: 4 },
] as const;

// ── Level metadata ────────────────────────────────────────────────────────────

type Severity = "error" | "warning" | "info" | "debug" | "other";

const LEVEL_META: Record<LogLevel, { severity: Severity; short: string }> = {
  LOG_EMERG:     { severity: "error",   short: "EMERG"   },
  LOG_ALERT:     { severity: "error",   short: "ALERT"   },
  LOG_CRIT:      { severity: "error",   short: "CRIT"    },
  LOG_ERR:       { severity: "error",   short: "ERROR"   },
  LOG_WARNING:   { severity: "warning", short: "WARN"    },
  LOG_NOTICE:    { severity: "info",    short: "NOTICE"  },
  LOG_INFO:      { severity: "info",    short: "INFO"    },
  LOG_DEBUG:     { severity: "debug",   short: "DEBUG"   },
  LOG_UNDEFINED: { severity: "other",   short: "?"       },
};

const SEVERITY_CLASSES: Record<Severity, string> = {
  error:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  info:    "bg-accent-muted text-accent-txt",
  debug:   "bg-elevated text-muted",
  other:   "bg-elevated text-muted",
};

const SEVERITY_ROW: Record<Severity, string> = {
  error:   "border-l-2 border-l-red-400/60",
  warning: "border-l-2 border-l-amber-400/60",
  info:    "",
  debug:   "opacity-70",
  other:   "opacity-60",
};

const FILTER_LEVELS = ["error", "warning", "info", "debug"] as const;

const INPUT = "px-2 py-1 text-xs rounded-lg border border-rim bg-surface text-txt focus:outline-none focus:border-accent";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMeta(level: LogLevel) {
  return LEVEL_META[level] ?? LEVEL_META.LOG_UNDEFINED;
}

/** HH:MM:SS for today, date + time otherwise; full timestamp for the tooltip. */
function fmtTimestamp(ts: string | null): { short: string; full: string } {
  if (!ts) return { short: "—", full: "" };
  const d = new Date(ts);
  if (isNaN(d.getTime())) return { short: ts, full: ts };
  const time = d.toLocaleTimeString(undefined, { hour12: false });
  const today = d.toDateString() === new Date().toDateString();
  return {
    short: today ? time : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${time}`,
    full: d.toLocaleString(),
  };
}

/** Back to the logfile's own line format — for copy and download. */
function rawLine(e: LogEntry): string {
  if (!e.ts) return e.message;
  return `${e.ts}:${e.level}:${e.logid}:${e.file}:${e.line}:${e.fn}: ${e.message}`;
}

function highlight(text: string, q: string): JSX.Element {
  if (!q) return text;
  const lower = text.toLowerCase();
  const out: JSX.Element[] = [];
  let from = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, from)) {
    out.push(text.slice(from, i), <mark class="bg-amber-200/70 dark:bg-amber-500/30 text-inherit rounded-sm">{text.slice(i, i + q.length)}</mark>);
    from = i + q.length;
  }
  out.push(text.slice(from));
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Meta = Omit<AdminLogs, "entries" | "offset" | "reset">;

export default function LogsSection() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams<{ q?: string; level?: string; file?: string; req?: string; fn?: string }>();
  const setFilter = (p: Record<string, string | undefined>) => setParams(p, { replace: true });

  const [meta, setMeta] = createSignal<Meta>();
  const [entries, setEntries] = createSignal<LogEntry[]>([]);
  const [live, setLive] = createSignal(true);
  const [pollError, setPollError] = createSignal(false);
  const [unseen, setUnseen] = createSignal(0);
  const [expanded, setExpanded] = createSignal<Set<LogEntry>>(new Set());

  // ── Live tail ──
  let offset: number | undefined;
  let inFlight = false;
  let listEl: HTMLDivElement | undefined;

  async function tick(force = false) {
    if (inFlight || (!force && (!live() || document.hidden))) return;
    inFlight = true;
    try {
      const d = await fetchAdminLogs(offset);
      const { entries: fresh, offset: next, reset, ...m } = d;
      const first = offset === undefined || reset;
      offset = next;
      // Keep the rows the reader is looking at still: the list has
      // overflow-anchor:none, so compensate scrollTop for what we prepend.
      const scrolled = !!listEl && listEl.scrollTop > 8;
      const before = listEl?.scrollHeight ?? 0;
      batch(() => {
        setMeta(m);
        setPollError(false);
        if (first) setEntries(fresh);
        else if (fresh.length) {
          setEntries((prev) => [...fresh, ...prev].slice(0, MAX_ENTRIES));
          if (scrolled) setUnseen((n) => n + fresh.length);
        }
      });
      if (scrolled && listEl) listEl.scrollTop += listEl.scrollHeight - before;
    } catch {
      setPollError(true);
    } finally {
      inFlight = false;
    }
  }

  onMount(() => {
    tick(true);
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    onCleanup(() => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    });
  });

  function toggleLive() {
    setLive((v) => !v);
    if (live()) tick();
  }

  function jumpToTop() {
    listEl?.scrollTo({ top: 0, behavior: "smooth" });
    setUnseen(0);
  }

  // ── Filters ──
  const query = () => (params.q ?? "").toLowerCase().trim();

  const severityCounts = createMemo(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0, debug: 0, other: 0 };
    for (const e of entries()) c[getMeta(e.level).severity]++;
    return c;
  });

  const fileCounts = createMemo(() => {
    const c = new Map<string, number>();
    for (const e of entries()) if (e.file) c.set(e.file, (c.get(e.file) ?? 0) + 1);
    if (params.file && !c.has(params.file)) c.set(params.file, 0);
    return [...c].sort((a, b) => b[1] - a[1]);
  });

  const filtered = createMemo(() => {
    const q = query();
    const { level, file, req, fn } = params;
    return entries().filter((e) =>
      (!level || getMeta(e.level).severity === level) &&
      (!file || e.file === file) &&
      (!req || e.logid === req) &&
      (!fn || e.fn === fn) &&
      (!q || `${e.message} ${e.file ?? ""} ${e.fn ?? ""}`.toLowerCase().includes(q)),
    );
  });

  const hasFilters = () => !!(params.q || params.level || params.file || params.req || params.fn);
  const clearFilters = () => setFilter({ q: undefined, level: undefined, file: undefined, req: undefined, fn: undefined });

  function toggleExpand(e: LogEntry) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(e) ? next.delete(e) : next.add(e);
      return next;
    });
  }

  async function copyEntry(e: LogEntry) {
    try {
      await navigator.clipboard.writeText(rawLine(e));
      toast.success(t("admin.copied") as string);
    } catch { /* clipboard denied — nothing useful to say */ }
  }

  function download() {
    const text = [...filtered()].reverse().map(rawLine).join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hub-log-${new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SubPageContent wide title={t("admin.logs_title")} description={t("admin.logs_desc")}>
      <Show when={meta()} fallback={pollError() ? <p class="text-sm text-muted">{t("admin.poll_error")}</p> : <Skeleton />}>
        {(m) => (
          <div class="space-y-3">
            <LogSettings meta={m()} onSaved={() => tick(true)} />

            <Show when={!m().debugging}>
              <p class="text-xs text-amber-700 dark:text-amber-400">{t("admin.debugging_off")}</p>
            </Show>

            <Show
              when={m().logfile && m().readable}
              fallback={
                <p class="text-sm text-muted py-6 text-center">
                  {m().logfile ? t("admin.log_unreadable", { file: m().logfile! }) : t("admin.no_logfile")}
                </p>
              }
            >
              {/* Toolbar */}
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  onClick={toggleLive}
                  aria-pressed={live()}
                  class={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                    live() ? "border-green-500/40 text-green-700 dark:text-green-400" : "border-rim text-muted hover:bg-elevated"
                  }`}
                  title={live() ? t("admin.pause") : t("admin.resume")}
                >
                  <span class={`h-2 w-2 rounded-full ${live() ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
                  {live() ? t("admin.live") : t("admin.paused")}
                </button>
                <Show when={pollError()}>
                  <span class="text-xs text-red-600 dark:text-red-400">{t("admin.poll_error")}</span>
                </Show>

                <input
                  type="search"
                  placeholder={t("admin.search_messages")}
                  value={params.q ?? ""}
                  onInput={(e) => setFilter({ q: e.currentTarget.value || undefined })}
                  class={`${INPUT} flex-1 min-w-[10rem]`}
                />

                <select
                  value={params.level ?? ""}
                  onChange={(e) => setFilter({ level: e.currentTarget.value || undefined })}
                  class={INPUT}
                >
                  <option value="">{t("admin.all_levels")} ({entries().length})</option>
                  <For each={FILTER_LEVELS}>
                    {(lv) => <option value={lv}>{t(`admin.level_${lv}`)} ({severityCounts()[lv]})</option>}
                  </For>
                </select>

                <select
                  value={params.file ?? ""}
                  onChange={(e) => setFilter({ file: e.currentTarget.value || undefined })}
                  class={`${INPUT} max-w-[12rem]`}
                >
                  <option value="">{t("admin.all_files")}</option>
                  <For each={fileCounts()}>
                    {([f, n]) => <option value={f}>{f} ({n})</option>}
                  </For>
                </select>

                <button
                  onClick={download}
                  disabled={filtered().length === 0}
                  class="px-2.5 py-1 text-xs rounded-lg border border-rim text-txt hover:bg-elevated disabled:opacity-50 transition-colors"
                >
                  {t("admin.download")}
                </button>
              </div>

              {/* Active filter chips */}
              <Show when={hasFilters()}>
                <div class="flex items-center gap-1.5 flex-wrap text-xs">
                  <Show when={params.req}>
                    <Chip label={t("admin.filter_request")} value={params.req!} onRemove={() => setFilter({ req: undefined })} />
                  </Show>
                  <Show when={params.fn}>
                    <Chip label={t("admin.filter_fn")} value={`${params.fn}()`} onRemove={() => setFilter({ fn: undefined })} />
                  </Show>
                  <span class="text-muted">
                    {t("admin.showing_n_of", { n: String(filtered().length), total: String(entries().length) })}
                  </span>
                  <button onClick={clearFilters} class="text-accent hover:underline">{t("admin.clear_filters")}</button>
                </div>
              </Show>

              {/* Log entries */}
              <div class="relative">
                <Show when={unseen() > 0}>
                  <button
                    onClick={jumpToTop}
                    class="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 text-xs rounded-full bg-accent text-accent-fg shadow"
                  >
                    ↑ {t("admin.new_entries", { n: String(unseen()) })}
                  </button>
                </Show>
                <div
                  ref={listEl}
                  onScroll={(e) => { if (e.currentTarget.scrollTop <= 8) setUnseen(0); }}
                  class="max-h-[70vh] overflow-y-auto [overflow-anchor:none] rounded-lg border border-rim divide-y divide-rim"
                >
                  <Show
                    when={filtered().length > 0}
                    fallback={
                      <p class="text-sm text-muted py-6 text-center">
                        {entries().length === 0 ? t("admin.log_empty") : t("admin.no_filter_match")}
                      </p>
                    }
                  >
                    <For each={filtered()}>
                      {(entry) => (
                        <LogRow
                          entry={entry}
                          query={query()}
                          expanded={expanded().has(entry)}
                          onToggle={() => toggleExpand(entry)}
                          onCopy={() => copyEntry(entry)}
                          onFilter={setFilter}
                        />
                      )}
                    </For>
                  </Show>
                </div>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </SubPageContent>
  );
}

// ── Settings disclosure ───────────────────────────────────────────────────────

function LogSettings(props: { meta: Meta; onSaved: () => void }) {
  const { t } = useI18n();
  // Seeded once — a live poll must not clobber unsaved edits
  const [debugging, setDebugging] = createSignal(props.meta.debugging);
  const [logfile, setLogfile] = createSignal(props.meta.logfile ?? "");
  const [loglevel, setLoglevel] = createSignal(props.meta.loglevel);
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);

  async function save() {
    setSaving(true);
    try {
      await saveLogSettings({ debugging: debugging(), logfile: logfile(), loglevel: loglevel() });
      batch(() => { setSaving(false); setSaved(true); });
      setTimeout(() => setSaved(false), 2000);
      props.onSaved();
    } catch (e) {
      setSaving(false);
      toast.error((e as Error).message);
    }
  }

  return (
    <details open={!props.meta.debugging || !props.meta.logfile} class="rounded-lg border border-rim bg-surface group">
      <summary class="px-4 py-2.5 text-sm font-medium text-txt cursor-pointer select-none flex items-center gap-2">
        <span class="transition-transform group-open:rotate-90">▸</span>
        {t("admin.log_settings")}
        <span class="text-xs font-normal text-muted">
          · {debugging() ? t("admin.logging_enabled") : t("admin.logging_disabled")}
        </span>
      </summary>
      <div class="px-4 pb-4 space-y-3">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <label class="flex items-center gap-3 cursor-pointer select-none">
            <button
              role="switch"
              aria-checked={debugging()}
              onClick={() => setDebugging((v) => !v)}
              class={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${debugging() ? "bg-accent" : "bg-rim"}`}
            >
              <span class={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${debugging() ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span class="text-sm font-medium text-txt">{t("admin.debugging")}</span>
          </label>

          <label class="flex items-center gap-2 text-xs text-muted whitespace-nowrap">
            {t("admin.log_level")}
            <select
              value={loglevel()}
              onChange={(e) => setLoglevel(parseInt(e.currentTarget.value))}
              disabled={!debugging()}
              class={`${INPUT} disabled:opacity-50`}
            >
              <For each={LOG_LEVELS}>{({ key, value }) => <option value={value}>{t(`admin.${key}`)}</option>}</For>
            </select>
          </label>
        </div>

        <label class="flex items-center gap-2 text-xs text-muted">
          <span class="whitespace-nowrap shrink-0">{t("admin.log_file")}</span>
          <input
            type="text"
            value={logfile()}
            onInput={(e) => setLogfile(e.currentTarget.value)}
            placeholder="e.g. log/hub.log"
            class={`${INPUT} flex-1 min-w-0 font-mono placeholder:text-muted`}
          />
        </label>

        <div class="flex items-center gap-3 justify-end">
          <Show when={saved()}>
            <span class="text-xs text-green-600 dark:text-green-400">{t("admin.saved")}</span>
          </Show>
          <button
            onClick={save}
            disabled={saving()}
            class="px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving() ? t("admin.saving") : t("admin.save_settings")}
          </button>
        </div>
      </div>
    </details>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────────

function Chip(props: { label: string; value: string; onRemove: () => void }) {
  return (
    <span class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-accent-muted text-accent-txt">
      <span class="opacity-70">{props.label}:</span>
      <span class="font-mono">{props.value}</span>
      <button onClick={props.onRemove} class="px-1 rounded-full hover:bg-accent/20" aria-label="×">×</button>
    </span>
  );
}

function LogRow(props: {
  entry: LogEntry;
  query: string;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onFilter: (p: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  const meta = () => getMeta(props.entry.level);
  const ts = () => fmtTimestamp(props.entry.ts);
  const isLong = () => props.entry.message.length > 200 || props.entry.message.includes("\n");
  const META_BTN = "font-mono text-muted hover:text-accent hover:underline truncate max-w-full";

  return (
    <div class={`group px-3 py-2 text-xs bg-surface hover:bg-elevated/50 transition-colors ${SEVERITY_ROW[meta().severity]}`}>
      <div class="flex items-center gap-x-2 gap-y-0.5 flex-wrap min-w-0 text-[0.6875rem]">
        <span class="font-mono text-muted tabular-nums whitespace-nowrap" title={ts().full}>{ts().short}</span>
        <span class={`px-1.5 py-px text-[0.625rem] font-semibold rounded uppercase tracking-wide ${SEVERITY_CLASSES[meta().severity]}`}>
          {meta().short}
        </span>
        <Show when={props.entry.file}>
          <button class={META_BTN} title={t("admin.filter_hint")} onClick={() => props.onFilter({ file: props.entry.file! })}>
            {props.entry.file}:{props.entry.line}
          </button>
          <button class={META_BTN} title={t("admin.filter_hint")} onClick={() => props.onFilter({ fn: props.entry.fn! })}>
            {props.entry.fn}()
          </button>
        </Show>
        <span class="ml-auto flex items-center gap-2">
          <Show when={props.entry.logid}>
            <button
              class={`${META_BTN} opacity-60`}
              title={`${t("admin.filter_request")} — ${t("admin.filter_hint")}`}
              onClick={() => props.onFilter({ req: props.entry.logid! })}
            >
              #{props.entry.logid}
            </button>
          </Show>
          <button
            onClick={props.onCopy}
            class="text-muted hover:text-txt sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
            title={t("admin.copy")}
          >
            {t("admin.copy")}
          </button>
        </span>
      </div>

      <pre
        class={`mt-1 font-mono text-xs leading-5 text-txt whitespace-pre-wrap break-words ${!props.expanded && isLong() ? "line-clamp-3" : ""}`}
      >
        {highlight(props.entry.message, props.query)}
      </pre>
      <Show when={isLong()}>
        <button onClick={props.onToggle} class="text-[0.625rem] text-accent hover:underline">
          {props.expanded ? t("admin.show_less") : t("admin.show_more")}
        </button>
      </Show>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div class="space-y-3 animate-pulse">
      <div class="h-10 rounded-lg bg-elevated" />
      <div class="flex gap-2">
        <div class="h-7 w-16 rounded-lg bg-elevated" />
        <div class="h-7 flex-1 rounded-lg bg-elevated" />
        <div class="h-7 w-24 rounded-lg bg-elevated" />
      </div>
      <div class="rounded-lg border border-rim overflow-hidden divide-y divide-rim">
        {Array.from({ length: 8 }, () => (
          <div class="px-3 py-2.5 bg-surface space-y-1.5">
            <div class="h-2.5 w-48 rounded bg-elevated opacity-60" />
            <div class="h-3 w-full rounded bg-elevated" />
          </div>
        ))}
      </div>
    </div>
  );
}
