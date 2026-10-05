// src/shared/stream/CardShell.tsx
//
// Per-card wrapper for the stream views: entrance via reveal(), exit via
// <Presence>. The <Show> is what Presence watches — exitCard() flips it, the
// card fades and collapses, and only then does the store drop the post.
// Also wraps non-post lists (articles, cards, directory, photos, wiki…) for the
// entrance; `uuid` is any per-session-unique key there (xchan hash, site url).
// In a grid pass class="grid" so the card still fills its cell; image tiles
// pass waitForImage so they enter once the picture is there (see reveal.ts).
import { Show, type JSX } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { reveal, isExiting, EXIT_MS } from "./reveal";

export default function CardShell(props: { uuid: string; class?: string; waitForImage?: boolean; children: JSX.Element }) {
  return (
    <Presence initial={false}>
      <Show when={!isExiting(props.uuid)}>
        <Motion.div
          class={props.class}
          data-reveal-wait={props.waitForImage ? "" : undefined}
          ref={(el) => reveal(el, () => props.uuid)}
          exit={{ opacity: 0, height: 0, transition: { duration: EXIT_MS / 1000, easing: [0.4, 0, 0.2, 1] } }}
        >
          {props.children}
        </Motion.div>
      </Show>
    </Presence>
  );
}
