// Ref factory: `ref={hydrateRef(() => html())}` re-runs LaTeX + Mermaid
// hydration on the element whenever `track` changes. Call it during render:
// Solid 2 ref callbacks are unowned, so an effect created inside one leaks.
import { createSignal, createEffect } from "solid-js";
import { hydrateLatex } from "./hydrateLatex";
import { hydrateMermaid } from "./hydrateMermaid";

export function hydrateRef(track: () => unknown) {
  const [el, setEl] = createSignal<HTMLElement>();
  createEffect(() => [track(), el()] as const, ([, e]) => {
    if (e) { hydrateLatex(e); hydrateMermaid(e); }
  });
  return (node: HTMLElement) => { setEl(() => node); };
}
