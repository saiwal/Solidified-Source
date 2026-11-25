// One shape per node type, so the graph reads without relying on colour.
// Paths are unit-radius around (0,0): the canvas scales them by the node's
// radius (Path2D), the legend/lists draw them as tiny SVGs. Published items
// are filled, drafts the same shape hollow; a missing [[Title]] is a dashed ring.
import { TYPE_COLOR, type NodeType } from "./api";

const poly = (pts: number, r: (i: number) => number, rot = -Math.PI / 2) =>
  Array.from({ length: pts }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / pts;
    return `${i ? "L" : "M"}${(Math.cos(a) * r(i)).toFixed(3)} ${(Math.sin(a) * r(i)).toFixed(3)}`;
  }).join("") + "Z";

const CIRCLE = "M1 0A1 1 0 1 1 -1 0A1 1 0 1 1 1 0Z";

export const SHAPE: Record<NodeType, string> = {
  post: CIRCLE,
  article: "M-0.85 -0.85H0.85V0.85H-0.85Z",
  card: poly(4, () => 1.15),
  webpage: poly(6, () => 1.05),
  note: poly(3, () => 1.25),
  wiki: poly(10, (i) => (i % 2 ? 0.55 : 1.3)),
  missing: CIRCLE,
  tag: "M-0.38 -1.1H0.38V-0.38H1.1V0.38H0.38V1.1H-0.38V0.38H-1.1V-0.38H-0.38Z",
  category: poly(5, () => 1.15),
};

/** Outline-only nodes: drafts and missing titles (dashed). */
export const isHollow = (n: { type: NodeType; draft?: boolean }) => !!n.draft || n.type === "missing";

export function NodeShape(props: { type: NodeType; draft?: boolean; size?: number; class?: string; style?: Record<string, string | number> }) {
  const hollow = () => isHollow(props);
  return (
    <svg viewBox="-1.5 -1.5 3 3" width={props.size ?? 10} height={props.size ?? 10} class={`shrink-0 ${props.class ?? ""}`} style={props.style} aria-hidden="true">
      <path
        d={SHAPE[props.type]}
        fill={hollow() ? "none" : TYPE_COLOR[props.type]}
        stroke={TYPE_COLOR[props.type]}
        stroke-width={hollow() ? 0.35 : 0}
        stroke-dasharray={props.type === "missing" ? "0.55 0.4" : undefined}
      />
    </svg>
  );
}
