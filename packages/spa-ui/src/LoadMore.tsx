// solidified's implementation of the load-more contract
// (spa-core types/ui.types.ts). Button mode for click-to-page lists, sentinel
// mode for feed-style auto-loading. Renders nothing once the list is exhausted.
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { LoadMoreProps } from "@utsukta/spa-core/types/ui.types";
import { Button } from "@ui/Button";
import { Spinner } from "@ui/Spinner";

export function LoadMore(props: LoadMoreProps) {
  const [ready, setReady] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    if (!props.auto || typeof IntersectionObserver === "undefined") return;
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && props.hasMore && !props.loading) props.onClick();
      },
      { rootMargin: "200px" },
    );
    setReady(true);
    onCleanup(() => observer?.disconnect());
  });

  // Re-observe when a page settles: a sentinel that stayed on screen after a
  // short page fires no new intersection, but observing again re-checks it.
  createEffect(() => {
    if (!ready() || !observer || !sentinel) return;
    if (!props.hasMore || props.loading) {
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
