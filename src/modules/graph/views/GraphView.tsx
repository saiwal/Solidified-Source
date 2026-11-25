// /graph/:nick — force-directed map of how a channel's content links up.
// Canvas, not SVG: a few hundred nodes re-laid out every frame is what canvas
// is for. The canvas is mouse/touch only, so the same nodes are also an
// sr-only link list.
import { createMemo, createSignal, For, Show, untrack, createEffect } from "solid-js";
import { useParams } from "@solidjs/router";
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation,
  type SimulationLinkDatum, type SimulationNodeDatum,
} from "d3-force";
import { useI18n } from "@utsukta/spa-core/i18n";
import { usePageNick } from "@utsukta/spa-core/store/site-config";
import { usePageOwnerName } from "@/shared/lib/pageOwnerName";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { cardClass } from "@ui/Card";
import { SearchField } from "@ui/SearchField";
import { EmptyState } from "@ui/EmptyState";
import { ErrorState } from "@ui/ErrorState";
import { Spinner } from "@ui/Spinner";
import { IconButton, buttonClass } from "@ui/Button";
import { MdOutlineCenter_focus_strong, MdOutlineClose, MdOutlineFit_screen } from "solid-icons/md";
import { fetchGraph, NODE_TYPES, TYPE_COLOR, type GraphNode, type NodeType } from "../api";
import { NodeShape, SHAPE, isHollow } from "../NodeShape";
import { baseGraph, hidden, showDrafts, visibleGraph } from "../filters";

type SimNode = GraphNode & SimulationNodeDatum & { degree: number };
type SimLink = SimulationLinkDatum<SimNode> & { kind?: "tag" };

// Below this many visible nodes every label fits; above it only hubs, focus
// and zoomed-in views are labelled, or the names pile up unreadably.
const SMALL_GRAPH = 40;

export default function GraphView() {
  const { t } = useI18n();
  const params = useParams();
  const pageNick = usePageNick();
  const owner = usePageOwnerName();
  const nick = () => params.nick || pageNick() || null;
  const [graph] = createQueryResource("links-graph", nick, fetchGraph);

  // Filters live in ../filters, shared with the sidebar widget that toggles them.
  const [query, setQuery] = createSignal("");
  // Clicking a dot selects it and opens the details panel; it doesn't leave the map.
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const base = createMemo(() => baseGraph(graph(), showDrafts()));
  const visible = createMemo(() => visibleGraph(base(), hidden()));

  // The selected node and its neighbours, from what's currently visible — a
  // node hidden by a type filter closes the panel.
  const selected = createMemo(() => {
    const g = visible();
    const id = selectedId();
    const node = id ? g?.nodes.find((n) => n.id === id) : undefined;
    if (!g || !node) return null;
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const pick = (ids: string[]) => ids.map((x) => byId.get(x)).filter((n): n is GraphNode => !!n);
    const out = g.edges.filter((e) => e.source === node.id);
    const inc = g.edges.filter((e) => e.target === node.id);
    return {
      node,
      out: pick(out.filter((e) => !e.kind).map((e) => e.target)),
      // A tag/category's items, or an item's tags and categories.
      terms: pick(out.filter((e) => e.kind).map((e) => e.target)),
      inc: pick(inc.filter((e) => !e.kind).map((e) => e.source)),
      tagged: pick(inc.filter((e) => e.kind).map((e) => e.source)),
    };
  });
  createEffect(() => !!selected(), (open) => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  let wrap!: HTMLDivElement;
  let canvas!: HTMLCanvasElement;
  let resetView = () => {};
  let fitAll = () => {};
  let redraw = () => {};
  // Survive the layout rebuild a filter toggle causes: nodes keep their spot
  // and the view its pan/zoom, so a toggle doesn't re-scatter the map.
  const lastPos = new Map<string, { x: number; y: number }>();
  let view = { x: 0, y: 0, k: 1 };

  // Re-highlight on search without restarting the layout (a tracked effect
  // can't create another one, so this lives here and calls the current draw).
  createEffect(() => [query(), selectedId()], () => { redraw(); });

  createEffect(visible, (g) => {
    const cleanups: (() => void)[] = [];
    if (!g || !canvas) return;

    const deg = new Map<string, number>();
    for (const e of g.edges) {
      deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
      deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
    }
    const nodes: SimNode[] = g.nodes.map((n) => ({ ...n, ...lastPos.get(n.id), degree: deg.get(n.id) ?? 0 }));
    const warm = nodes.some((n) => lastPos.has(n.id));
    const links: SimLink[] = g.edges.map((e) => ({ ...e }));
    const neighbours = new Map<string, Set<string>>();
    for (const e of g.edges) {
      (neighbours.get(e.source) ?? neighbours.set(e.source, new Set()).get(e.source)!).add(e.target);
      (neighbours.get(e.target) ?? neighbours.set(e.target, new Set()).get(e.target)!).add(e.source);
    }
    const radius = (n: SimNode) => 4 + Math.sqrt(n.degree) * 2.5;
    const paths = Object.fromEntries(NODE_TYPES.map((ty) => [ty, new Path2D(SHAPE[ty])])) as Record<NodeType, Path2D>;
    // Drawn size never drops below ~3px on screen, or a zoomed-out map is specks.
    const drawR = (n: SimNode) => Math.max(radius(n), 3 / view.k);

    let w = 0, h = 0, dpr = 1;
    let hover: SimNode | null = null;
    // Untracked: draw() reads query()/selectedId(), and the effect calls it
    // (via resize) on setup — tracked, a click re-ran this whole effect,
    // rebuilding the layout and resetting the view. Only the small effect
    // below redraws on those.
    const draw = () => untrack(paint);

    const sim = forceSimulation(nodes)
      // Shared-term edges pull a third as hard and sit further out, so a
      // busy tag gathers its items without crushing the real link structure.
      // (d3's default strength is 1 / min(degree of either end) — kept.)
      .force("link", forceLink<SimNode, SimLink>(links).id((n) => n.id)
        .distance((l) => (l.kind ? 70 : 50))
        .strength((l) => (l.kind ? 0.33 : 1) / Math.max(1, Math.min(
          deg.get((l.source as SimNode).id) ?? 1, deg.get((l.target as SimNode).id) ?? 1))))
      .force("charge", forceManyBody().strength(-90))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<SimNode>((n) => radius(n) + 2))
      .on("tick", draw);
    // Re-laid out after a toggle: settle gently from where things were.
    if (warm) sim.alpha(0.3);
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
        // Shared-term edges are dashed and fainter: a link is a claim the
        // author made, a shared tag only a hint.
        ctx.globalAlpha = on ? 0.9 : focus || q ? 0.15 : l.kind ? 0.3 : 0.5;
        ctx.setLineDash(l.kind ? [4 / view.k, 3 / view.k] : []);
        ctx.beginPath();
        ctx.moveTo(s.x!, s.y!);
        ctx.lineTo(d.x!, d.y!);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const n of nodes) {
        ctx.globalAlpha = lit(n) ? 1 : 0.15;
        // The shape is unit-size; scaled by r, so line widths divide by it.
        const r = drawR(n);
        ctx.save();
        ctx.translate(n.x!, n.y!);
        ctx.scale(r, r);
        if (isHollow(n)) {
          const px = 1 / (view.k * r);
          ctx.lineWidth = 2 * px;
          if (n.type === "missing") ctx.setLineDash([3 * px, 2 * px]);
          ctx.strokeStyle = TYPE_COLOR[n.type];
          ctx.stroke(paths[n.type]);
        } else {
          ctx.fillStyle = TYPE_COLOR[n.type];
          ctx.fill(paths[n.type]);
        }
        ctx.restore();
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

    redraw = draw;

    cleanups.push(() => {
      for (const n of nodes) lastPos.set(n.id, { x: n.x!, y: n.y! });
      redraw = () => {};
      sim.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    });
    return () => cleanups.forEach((f) => f());
  });

  return (
    <div class="flex flex-col gap-3 p-3 md:p-4 h-[calc(100dvh-8rem)] min-h-[24rem]">
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-semibold text-txt">{owner() === null ? t("graph.title_mine") : t("graph.title_of", { name: owner()! })}</h1>
          <p class="text-sm text-muted">{owner() === null ? t("graph.subtitle") : t("graph.subtitle_of", { name: owner()! })}</p>
        </div>
        <div class="w-full sm:w-56">
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
        {/* No links at all — shared tags alone don't count, the hint is about [[links]]. */}
        <Show when={graph() && !graph()!.edges.some((e) => !e.kind) && !visible()?.edges.length}>
          <EmptyState class="absolute inset-0 m-auto h-fit max-w-md">{t("graph.empty")}</EmptyState>
        </Show>
        <canvas ref={canvas} class="block w-full h-full" aria-hidden="true" />
        <Show when={visible()}>
          {(g) => (
            <span class="absolute top-3 left-3 text-xs text-muted pointer-events-none">
              {t("graph.stats", { nodes: g().nodes.length, edges: g().edges.length })}
            </span>
          )}
        </Show>
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
                <NodeShape type={d().node.type} draft={d().node.draft} size={12} class="mt-1" />
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-muted">{d().node.draft
                    ? t("graph.draft_of", { type: t(`graph.type_${d().node.type}`) })
                    : t(`graph.type_${d().node.type}`)}</p>
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
                <NodeList label={t("graph.tagged")} nodes={d().tagged} onPick={setSelectedId} />
                <NodeList label={t("graph.terms")} nodes={d().terms} onPick={setSelectedId} />
              </div>
              <Show when={d().node.url}>
                <div class="flex justify-end p-2 border-t border-rim">
                  <a href={d().node.url!} class={buttonClass("primary", "sm")}>{t("graph.open")}</a>
                </div>
              </Show>
            </section>
          )}
        </Show>
        <ul class="sr-only">
          <For each={visible()?.nodes.filter((n) => n.url)}>
            {(n) => <li><a href={n.url!}>{n.draft ? t("graph.draft_of", { type: t(`graph.type_${n.type}`) }) : t(`graph.type_${n.type}`)}: {n.title}</a></li>}
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
                <NodeShape type={n.type} draft={n.draft} />
                <span class="min-w-0 truncate">{n.title}</span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
