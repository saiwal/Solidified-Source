// /graph/:nick — force-directed map of how a channel's content links up.
// Canvas, not SVG: a few hundred nodes re-laid out every frame is what canvas
// is for. The canvas is mouse/touch only, so the same nodes are also an
// sr-only link list.
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { A, useParams } from "@solidjs/router";
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation,
  type SimulationLinkDatum, type SimulationNodeDatum,
} from "d3-force";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { cardClass } from "@ui/Card";
import { Chip } from "@ui/Chip";
import { SearchField } from "@ui/SearchField";
import { EmptyState } from "@ui/EmptyState";
import { ErrorState } from "@ui/ErrorState";
import { Spinner } from "@ui/Spinner";
import { IconButton, buttonClass } from "@ui/Button";
import { MdOutlineCenter_focus_strong, MdOutlineClose, MdOutlineFit_screen } from "solid-icons/md";
import { fetchGraph, NODE_TYPES, TYPE_COLOR, type Graph, type GraphNode, type NodeType } from "../api";

type SimNode = GraphNode & SimulationNodeDatum & { degree: number };
type SimLink = SimulationLinkDatum<SimNode>;

// Below this many visible nodes every label fits; above it only hubs, focus
// and zoomed-in views are labelled, or the names pile up unreadably.
const SMALL_GRAPH = 40;

export default function GraphView() {
  const { t } = useI18n();
  const params = useParams();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick() || null;
  const [graph] = createQueryResource("links-graph", nick, fetchGraph);

  // Hidden types persist per browser, so the filter survives navigating away.
  const HIDDEN_KEY = "hz-graph-hidden";
  // Node types, plus a pseudo-filter for posts with no links.
  type Filter = NodeType | "unlinked";
  const readHidden = (): Set<Filter> => {
    try {
      const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
      return new Set(Array.isArray(v) ? v.filter((x) => x === "unlinked" || NODE_TYPES.includes(x)) : []);
    } catch {
      return new Set();
    }
  };
  const [hidden, setHidden] = createSignal<Set<Filter>>(readHidden());
  const [query, setQuery] = createSignal("");
  // Clicking a dot selects it and opens the details panel; it doesn't leave the map.
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const toggle = (ty: Filter) => setHidden((s) => {
    const n = new Set(s);
    n.has(ty) ? n.delete(ty) : n.add(ty);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...n]));
    } catch {
      // private mode / storage full — the filter just won't persist
    }
    return n;
  });

  const visible = createMemo<Graph | null>(() => {
    const g = graph();
    if (!g) return null;
    const h = hidden();
    const nodes = g.nodes.filter((n) => !h.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    let edges = g.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    // "Unlinked posts" off: drop posts with no *visible* link — including one
    // whose links all went to a type that's hidden right now.
    const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
    const kept = h.has("unlinked") ? nodes.filter((n) => n.type !== "post" || linked.has(n.id)) : nodes;
    if (kept.length !== nodes.length) {
      const keptIds = new Set(kept.map((n) => n.id));
      edges = edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
    }
    return { nodes: kept, edges };
  });
  const presentTypes = createMemo(() => NODE_TYPES.filter((ty) => graph()?.nodes.some((n) => n.type === ty)));

  // The selected node and its neighbours, from what's currently visible — a
  // node hidden by a type filter closes the panel.
  const selected = createMemo(() => {
    const g = visible();
    const id = selectedId();
    const node = id ? g?.nodes.find((n) => n.id === id) : undefined;
    if (!g || !node) return null;
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const pick = (ids: string[]) => ids.map((x) => byId.get(x)).filter((n): n is GraphNode => !!n);
    return {
      node,
      out: pick(g.edges.filter((e) => e.source === node.id).map((e) => e.target)),
      inc: pick(g.edges.filter((e) => e.target === node.id).map((e) => e.source)),
    };
  });
  createEffect(() => {
    if (!selected()) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  let wrap!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let resetView = () => {};
  let fitAll = () => {};

  createEffect(() => {
    const g = visible();
    if (!g || !canvas) return;

    const deg = new Map<string, number>();
    for (const e of g.edges) {
      deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
      deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
    }
    const nodes: SimNode[] = g.nodes.map((n) => ({ ...n, degree: deg.get(n.id) ?? 0 }));
    const links: SimLink[] = g.edges.map((e) => ({ ...e }));
    const neighbours = new Map<string, Set<string>>();
    for (const e of g.edges) {
      (neighbours.get(e.source) ?? neighbours.set(e.source, new Set()).get(e.source)!).add(e.target);
      (neighbours.get(e.target) ?? neighbours.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    const radius = (n: SimNode) => 4 + Math.sqrt(n.degree) * 2.5;
    // Drawn size never drops below ~3px on screen, or a zoomed-out map is specks.
    let view = { x: 0, y: 0, k: 1 };
    const drawR = (n: SimNode) => Math.max(radius(n), 3 / view.k);

    let w = 0, h = 0, dpr = 1;
    let hover: SimNode | null = null;
    // Untracked: draw() reads query()/selectedId(), and the effect calls it
    // (via resize) on setup — tracked, a click re-ran this whole effect,
    // rebuilding the layout and resetting the view. Only the small effect
    // below redraws on those.
    const draw = () => untrack(paint);

    const sim = forceSimulation(nodes)
      .force("link", forceLink<SimNode, SimLink>(links).id((n) => n.id).distance(50))
      .force("charge", forceManyBody().strength(-90))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<SimNode>((n) => radius(n) + 2))
      .on("tick", draw);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim.stop();
      sim.tick(300);
    }

    function paint() {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const css = getComputedStyle(document.documentElement);
      const rim = css.getPropertyValue("--color-rim-strong").trim() || "#999";
      const txt = css.getPropertyValue("--color-txt").trim() || "#222";
      const accent = css.getPropertyValue("--color-accent").trim() || "#36f";
      const q = query().trim().toLowerCase();
      // Hover wins; otherwise the selected node stays in focus.
      const sel = selectedId();
      const center = hover ?? (sel ? nodes.find((n) => n.id === sel) ?? null : null);
      const focus = center ? neighbours.get(center.id) ?? new Set<string>() : null;
      const lit = (n: SimNode) =>
        (!focus || n === center || focus.has(n.id)) && (!q || n.title.toLowerCase().includes(q));

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + view.x, h / 2 + view.y);
      ctx.scale(view.k, view.k);

      ctx.lineWidth = 1 / view.k;
      for (const l of links) {
        const s = l.source as SimNode, d = l.target as SimNode;
        const on = center && (s === center || d === center);
        ctx.strokeStyle = on ? accent : rim;
        ctx.globalAlpha = on ? 0.9 : focus || q ? 0.15 : 0.5;
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(d.x!, d.y!);
        ctx.stroke();
      }
      for (const n of nodes) {
        ctx.globalAlpha = lit(n) ? 1 : 0.15;
        ctx.fillStyle = TYPE_COLOR[n.type];
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, drawR(n), 0, Math.PI * 2);
        ctx.fill();
        if (n.type === "missing") {
          ctx.strokeStyle = txt;
          ctx.stroke();
        }
        if (n.id === sel) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2 / view.k;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, drawR(n) + 3 / view.k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1 / view.k;
        }
      }
      // Labels: all on a small graph or once zoomed in, else hubs and whatever
      // is in focus. Font size is constant on screen, so when zoomed out
      // neighbouring labels would pile up: place them greedily by priority
      // (hover, its neighbours, search hits, then most-linked) and skip any
      // that would overlap one already drawn.
      ctx.fillStyle = txt;
      ctx.font = `${12 / view.k}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      const prio = (n: SimNode) =>
        n === center ? 3e6 : focus?.has(n.id) ? 2e6 : q && lit(n) ? 1e6 : n.degree;
      const candidates = nodes
        .filter((n) => nodes.length < SMALL_GRAPH || view.k > 1.6 || n.degree >= 4
          || n === center || focus?.has(n.id) || (q && lit(n)))
        .sort((a, b) => prio(b) - prio(a));
      // ponytail: O(labels²) overlap test — fine for the few dozen labels a
      // screen can hold; a grid index if graphs get thousands of labels.
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      const lineH = 14 / view.k;
      for (const n of candidates) {
        const label = n.title.length > 40 ? n.title.slice(0, 40) + "…" : n.title;
        const half = ctx.measureText(label).width / 2 + 2 / view.k;
        // The focused node's label goes above the dot — a cursor resting on
        // the dot covers the space below it.
        const y = n === center ? n.y! - drawR(n) - 6 / view.k : n.y! + drawR(n) + 12 / view.k;
        const box = { x0: n.x! - half, x1: n.x! + half, y0: y - lineH, y1: y + 3 / view.k };
        if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
        placed.push(box);
        ctx.globalAlpha = lit(n) ? 1 : 0.2;
        ctx.fillText(label, n.x!, y);
      }
      ctx.globalAlpha = 1;
    }

    const resize = () => {
      dpr = devicePixelRatio || 1;
      w = wrap.clientWidth;
      h = wrap.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    resetView = () => { view = { x: 0, y: 0, k: 1 }; draw(); };
    // Zoom and centre so every visible node (with its label room) is on screen.
    fitAll = () => {
      if (!nodes.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) {
        const r = radius(n);
        x0 = Math.min(x0, n.x! - r); x1 = Math.max(x1, n.x! + r);
        y0 = Math.min(y0, n.y! - r); y1 = Math.max(y1, n.y! + r + 14);
      }
      const pad = 32;
      const k = Math.min(6, Math.max(0.2, Math.min((w - pad * 2) / (x1 - x0 || 1), (h - pad * 2) / (y1 - y0 || 1))));
      view = { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k };
      draw();
    };

    // ── Pointer: drag a node, pan the background, click to open ──────────
    const toWorld = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      return { x: (cx - r.left - w / 2 - view.x) / view.k, y: (cy - r.top - h / 2 - view.y) / view.k };
    };
    const hit = (cx: number, cy: number) => {
      const p = toWorld(cx, cy);
      let best: SimNode | null = null, bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(n.x! - p.x, n.y! - p.y);
        if (d < drawR(n) + 4 / view.k && d < bestD) { best = n; bestD = d; }
      }
      return best;
    };

    let drag: { node: SimNode | null; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const node = hit(e.clientX, e.clientY);
      drag = { node, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
      if (node) { node.fx = node.x; node.fy = node.y; }
    };
    const move = (e: PointerEvent) => {
      if (!drag) {
        const n = hit(e.clientX, e.clientY);
        if (n !== hover) { hover = n; canvas.style.cursor = n ? "pointer" : "default"; draw(); }
        return;
      }
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      if (drag.node) {
        const p = toWorld(e.clientX, e.clientY);
        drag.node.fx = p.x; drag.node.fy = p.y;
        if (drag.moved) sim.alphaTarget(0.3).restart();
      } else {
        view.x = drag.vx + e.clientX - drag.sx;
        view.y = drag.vy + e.clientY - drag.sy;
        draw();
      }
    };
    const up = () => {
      if (!drag) return;
      const { node, moved } = drag;
      drag = null;
      if (node) { node.fx = null; node.fy = null; sim.alphaTarget(0); }
      // A click (not a drag) selects a dot, or clears the selection on empty space.
      if (!moved) setSelectedId(node ? node.id : null);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left - w / 2, my = e.clientY - r.top - h / 2;
      const k = Math.min(6, Math.max(0.2, view.k * Math.exp(-e.deltaY * 0.0015)));
      view.x = mx - ((mx - view.x) * k) / view.k;
      view.y = my - ((my - view.y) * k) / view.k;
      view.k = k;
      draw();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });

    // Re-highlight on search without restarting the layout.
    createEffect(() => { query(); selectedId(); draw(); });

    onCleanup(() => {
      sim.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    });
  });

  return (
    <div class="flex flex-col gap-3 p-3 md:p-4 h-[calc(100dvh-8rem)] min-h-[24rem]">
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-semibold text-txt">{t("graph.title")}</h1>
          <p class="text-sm text-muted">{t("graph.subtitle")}</p>
        </div>
        <Show when={graph()}>
          {(g) => <span class="text-xs text-muted">{t("graph.stats", { nodes: g().nodes.length, edges: g().edges.length })}</span>}
        </Show>
      </div>

      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={t("graph.filter")}>
        <For each={presentTypes()}>
          {(ty) => (
            <Chip size="sm" selected={!hidden().has(ty)} onClick={() => toggle(ty)}
              icon={<span class="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR[ty] }} />}>
              {t(`graph.type_${ty}`)}
            </Chip>
          )}
        </For>
        <Show when={presentTypes().includes("post")}>
          <Chip size="sm" selected={!hidden().has("unlinked")} onClick={() => toggle("unlinked")}
            icon={<span class="inline-block w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLOR.post, opacity: 0.45 }} />}>
            {t("graph.unlinked_posts")}
          </Chip>
        </Show>
        <div class="ml-auto w-full sm:w-56">
          <SearchField value={query()} onInput={setQuery} label={t("graph.find_node")}
            placeholder={t("graph.find_node")} clearLabel={t("layout.clear_search")} />
        </div>
      </div>

      <div ref={wrap} class={`${cardClass()} relative flex-1 min-h-0 overflow-clip touch-none`}>
        <Show when={graph.error}>
          <div class="absolute inset-0 grid place-items-center p-4">
            <ErrorState message={t("graph.title")} detail={String(graph.error?.message ?? graph.error)} />
          </div>
        </Show>
        <Show when={graph.loading && !graph()}>
          <div class="absolute inset-0 grid place-items-center"><Spinner /></div>
        </Show>
        <Show when={graph() && graph()!.edges.length === 0}>
          <EmptyState class="absolute inset-0 m-auto h-fit max-w-md">{t("graph.empty")}</EmptyState>
        </Show>
        <canvas ref={canvas} class="block w-full h-full" aria-hidden="true" />
        <div class="absolute top-2 right-2 flex gap-1">
          <IconButton label={t("graph.fit_all")} onClick={() => fitAll()}>
            <MdOutlineFit_screen size={18} />
          </IconButton>
          <IconButton label={t("graph.reset_view")} onClick={() => resetView()}>
            <MdOutlineCenter_focus_strong size={18} />
          </IconButton>
        </div>
        <Show when={selected()}>
          {(d) => (
            <section
              aria-label={d().node.title}
              class={`${cardClass(true)} absolute bottom-2 left-2 right-2 sm:right-auto sm:w-80 max-h-[60%] flex flex-col overflow-clip`}
            >
              <header class="flex items-start gap-2 p-3 border-b border-rim">
                <span class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPE_COLOR[d().node.type] }} />
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-muted">{t(`graph.type_${d().node.type}`)}</p>
                  <h2 class="text-sm font-semibold text-txt line-clamp-3 break-words">{d().node.title}</h2>
                </div>
                <IconButton size="sm" label={t("layout.close")} onClick={() => setSelectedId(null)}>
                  <MdOutlineClose size={16} />
                </IconButton>
              </header>
              <div class="flex-1 min-h-0 overflow-y-auto py-1">
                <Show when={d().node.type === "missing"}>
                  <p class="px-3 py-2 text-xs text-muted">{t("graph.missing_hint")}</p>
                </Show>
                <NodeList label={t("graph.links_to")} nodes={d().out} onPick={setSelectedId} />
                <NodeList label={t("graph.linked_from")} nodes={d().inc} onPick={setSelectedId} />
              </div>
              <Show when={d().node.url}>
                <div class="flex justify-end p-2 border-t border-rim">
                  <A href={d().node.url!} class={buttonClass("primary", "sm")}>{t("graph.open")}</A>
                </div>
              </Show>
            </section>
          )}
        </Show>
        <ul class="sr-only">
          <For each={visible()?.nodes.filter((n) => n.url)}>
            {(n) => <li><a href={n.url!}>{t(`graph.type_${n.type}`)}: {n.title}</a></li>}
          </For>
        </ul>
      </div>
    </div>
  );
}

// A neighbour list in the details panel; picking one moves the selection.
function NodeList(props: { label: string; nodes: GraphNode[]; onPick: (id: string) => void }) {
  return (
    <Show when={props.nodes.length}>
      <p class="px-3 pt-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-widest text-muted">
        {props.label} ({props.nodes.length})
      </p>
      <ul>
        <For each={props.nodes}>
          {(n) => (
            <li>
              <button
                type="button"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-txt hover:bg-elevated transition-colors"
                onClick={() => props.onPick(n.id)}
              >
                <span class="w-2 h-2 rounded-full shrink-0" style={{ background: TYPE_COLOR[n.type] }} />
                <span class="min-w-0 truncate">{n.title}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
