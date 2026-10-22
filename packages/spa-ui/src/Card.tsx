// solidified's implementation of the card contract (spa-core types/ui.types.ts):
// a bordered surface panel. Padding, layout and overflow stay at the call site,
// so wrapping existing markup in <Card> never moves its content.
// cardClass() is for a surface that has to stay an <li>/<section>/<form>.
import { splitProps } from "solid-js";
import type { CardHeaderProps, CardProps } from "@utsukta/spa-core/types/ui.types";

export function cardClass(raised = false): string {
  return `hz-card bg-surface border border-rim rounded-xl${raised ? " shadow-sm" : ""}`;
}

export const cardHeaderClass = "hz-card-header border-b border-rim px-4 py-3";

export function Card(props: CardProps) {
  const [own, rest] = splitProps(props, ["raised", "class"]);
  return <div class={`${cardClass(own.raised)} ${own.class ?? ""}`} {...rest} />;
}

export function CardHeader(props: CardHeaderProps) {
  const [own, rest] = splitProps(props, ["class"]);
  return <div class={`${cardHeaderClass} ${own.class ?? ""}`} {...rest} />;
}
