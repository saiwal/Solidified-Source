import { apiError } from "@utsukta/spa-core/lib/fetch";
import { isAdmin } from "@utsukta/spa-core/store/auth-store";
import { createSignal, createEffect, on, onCleanup, onMount, For, Show } from "solid-js";
import { toast } from "@utsukta/spa-core/store/toast";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";

interface PerfStats {
  loadavg: [number, number, number];
  dbqueries: number;
  outqueue: number;
  queueworkers: number;
  workqsz: number;
  ts: number;
}

const POLL_INTERVAL = 5000;
const ENDPOINT = "/perfstats";
const MAX_POINTS = 30;

interface TimePoint {
  ts: number;
  la1: number; la5: number; la15: number;
  dbRate: number | null;
  outqueue: number;
  queueworkers: number;
  workqsz: number;
}

export default function PerfStatsPanel() {
  return (
    <Show when={isAdmin()}>
      <PerfStatsPanelInner />
    </Show>
  );
}

function PerfStatsPanelInner() {
  const { t } = useI18n();
  const [points, setPoints] = createSignal<TimePoint[]>([]);
  const [latest, setLatest] = createSignal<PerfStats | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [age, setAge] = createSignal(0);

  let lastFetch = 0, lastTs = 0, lastQ = 0;

  async function fetchStats() {
    try {
      const res = await fetch(ENDPOINT, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw await apiError(res);
      const data: PerfStats = await res.json();

      let rate: number | null = null;
      if (lastTs !== 0) {
        const dt = data.ts - lastTs;
        const dq = data.dbqueries - lastQ;
        if (dt > 0) rate = Math.round(dq / dt);
      }
      lastTs = data.ts; lastQ = data.dbqueries;

      const pt: TimePoint = {
        ts: data.ts,
        la1: data.loadavg[0], la5: data.loadavg[1], la15: data.loadavg[2],
        dbRate: rate,
        outqueue: data.outqueue,
        queueworkers: data.queueworkers,
        workqsz: data.workqsz,
      };

      setPoints((prev) => [...prev.slice(-(MAX_POINTS - 1)), pt]);
      setLatest(data);
      setError(null);
      lastFetch = Date.now();
      setAge(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    }
  }

  // Only toast on the first error, not every polling cycle
  createEffect(on(error, (err, prev) => { if (err && !prev) toast.error(`Performance stats: ${err}`); }));

  onMount(() => {
    fetchStats();
    const poll = setInterval(fetchStats, POLL_INTERVAL);
    const tick = setInterval(
      () => setAge(Math.round((Date.now() - lastFetch) / 1000)),
      1000
    );
    onCleanup(() => { clearInterval(poll); clearInterval(tick); });
  });

  function Sparkline(p: { data: number[]; color: string }) {
    const W = 120, H = 28, pad = 2;
    const path = () => {
      const vals = p.data;
      if (vals.length < 2) return { line: "", area: "" };
      const max = Math.max(...vals, 0.01);
      const min = Math.min(...vals);
      const range = max - min || 1;
      const step = (W - pad * 2) / (vals.length - 1);
      const pts = vals.map((v, i) => {
        const x = pad + i * step;
        const y = H - pad - ((v - min) / range) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const lastX = (pad + (vals.length - 1) * step).toFixed(1);
      return {
        line: `M${pts.join("L")}`,
        area: `M${pad},${H - pad} L${pts.join("L")} L${lastX},${H - pad}Z`,
      };
    };
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "28px", display: "block", overflow: "visible" }}
      >
        <path d={path().area} fill={p.color} opacity="0.15" />
        <path
          d={path().line}
          fill="none"
          stroke={p.color}
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    );
  }

  return (
    <Card raised class="p-3.5">
      {/* Header */}
      <div class="flex items-center justify-between mb-2.5">
        <span class="text-xs font-medium uppercase tracking-wider text-muted">
          {t("hq.server_performance")}
        </span>
        <Show when={latest()}>
          <span class="flex items-center gap-1.5 text-xs text-muted">
            <span class={`w-1.5 h-1.5 rounded-full ${error() ? "bg-danger" : "bg-success animate-pulse"}`} />
            {error() ? "error" : age() < 3 ? "live" : `${age()}s ago`}
          </span>
        </Show>
      </div>

      {/* Skeleton */}
      <Show when={!latest()}>
        <div class="grid gap-2" style={{ "grid-template-columns": "repeat(auto-fit, minmax(120px, 1fr))" }}>
          <For each={[1,2,3,4,5,6]}>{() =>
            <div class="h-16 rounded-lg animate-pulse bg-elevated" />
          }</For>
        </div>
      </Show>

      {/* Cards */}
      <Show when={latest()} keyed>
        {(s) => {
          const pts = points();
          const lastPt = pts[pts.length - 1];

          const graphs = [
            { label: "Load 1m",      value: s.loadavg[0].toFixed(2), color: "#60a5fa", data: pts.map(p => p.la1) },
            { label: "Load 5m",      value: s.loadavg[1].toFixed(2), color: "#34d399", data: pts.map(p => p.la5) },
            { label: "Load 15m",     value: s.loadavg[2].toFixed(2), color: "#a78bfa", data: pts.map(p => p.la15) },
            { label: "DB queries/s", value: lastPt?.dbRate != null ? String(lastPt.dbRate) : "—", color: "#f59e0b", data: pts.filter(p => p.dbRate != null).map(p => p.dbRate as number) },
            { label: "Out queue",    value: String(s.outqueue),   color: "#f87171", data: pts.map(p => p.outqueue) },
            { label: "Work queue",   value: String(s.workqsz),    color: "#fb923c", data: pts.map(p => p.workqsz) },
          ];

          return (
            <div class="grid gap-2" style={{ "grid-template-columns": "repeat(auto-fit, minmax(120px, 1fr))" }}>
              <For each={graphs}>
                {(g) => (
                  <div class="bg-elevated rounded-lg px-2.5 pt-2 pb-1.5 min-w-0 border border-rim">
                    <p class="text-[0.6875rem] text-muted truncate mb-0.5">{g.label}</p>
                    <p class="text-lg font-medium text-txt tabular-nums leading-tight">{g.value}</p>
                    <div class="mt-1 h-7">
                      <Show
                        when={g.data.length > 1}
                        fallback={<p class="text-[0.6875rem] text-muted leading-7">collecting…</p>}
                      >
                        <Sparkline data={g.data} color={g.color} />
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </div>
          );
        }}
      </Show>
    </Card>
  );
}
