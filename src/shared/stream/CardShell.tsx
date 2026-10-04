// src/shared/stream/CardShell.tsx
//
// Per-card wrapper for the stream views: entrance via reveal(), exit via
// <Presence>. The <Show> is what Presence watches — exitCard() flips it, the
// card fades and collapses, and only then does the store drop the post.
import { Show, type JSX } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { reveal, isExiting, EXIT_MS } from "./reveal";

export default function CardShell(props: { uuid: string; class?: string; children: JSX.Element }) {
  return (
    <Presence initial={false}>
      <Show when={!isExiting(props.uuid)}>
        <Motion.div
          class={props.class}
          ref={(el) => reveal(el, () => props.uuid)}
          exit={{ opacity: 0, height: 0, transition: { duration: EXIT_MS / 1000, easing: [0.4, 0, 0.2, 1] } }}
        >
          {props.children}
        </Motion.div>
      </Show>
    </Presence>
  );
}
