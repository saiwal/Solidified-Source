// solidified's implementation of the load-more contract
// (spa-core types/ui.types.ts). Button mode for click-to-page lists, sentinel
// mode for feed-style auto-loading. Renders nothing once the list is exhausted.
import { Show, createSignal, onSettled, createEffect, untrack } from "solid-js";
import type { LoadMoreProps } from "@utsukta/spa-core/types/ui.types";
import { Button } from "@ui/Button";
import { Spinner } from "@ui/Spinner";

export function LoadMore(props: LoadMoreProps) {
  const [ready, setReady] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  const auto = untrack(() => props.auto);
  onSettled(() => {
    const cleanups: (() => void)[] = [];
    if (!auto || typeof IntersectionObserver === "undefined") return () => cleanups.forEach((f) => f());
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && props.hasMore && !props.loading) props.onClick();
      },
      { rootMargin: "200px" },
    );
    setReady(true);
    cleanups.push(() => observer?.disconnect());
    return () => cleanups.forEach((f) => f());
  });

  // Re-observe when a page settles: a sentinel that stayed on screen after a
  // short page fires no new intersection, but observing again re-checks it.
  createEffect(() => [ready(), !!props.hasMore && !props.loading] as const, ([isReady, wanted]) => {
    if (!isReady || !observer || !sentinel) return;
    if (!wanted) {
      observer.disconnect();
      return;
    }
    observer.observe(sentinel);
  });

  return (
    <Show when={props.hasMore}>
      <Show
        when={!props.auto}
        fallback={
          <div
            ref={sentinel}
            aria-hidden="true"
            class={`hz-load-more h-8 ${props.class ?? ""}`}
          />
        }
      >
        <div class={`flex justify-center py-4 ${props.class ?? ""}`}>
          <Button variant="ghost" onClick={props.onClick} disabled={props.loading}>
            <Show when={props.loading} fallback={props.label}>
              <Spinner size="xs" />
              <span>{props.loadingLabel ?? props.label}</span>
            </Show>
          </Button>
        </div>
      </Show>
    </Show>
  );
}
