// Text input with a themed suggestion list. A native <datalist> renders
// browser chrome that no CSS can reach, so it never matched the theme; this is
// the same portalled, token-styled panel the editor's MentionPopup uses.
//
// It suggests without restricting — every field using it is free text, so a
// value that isn't in the list is valid and typing just narrows the panel.
import { For, Show, createSignal, createMemo, onCleanup, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { topLayer } from "@utsukta/spa-core/lib/top-layer";

const MAX_VISIBLE = 8;

export default function SuggestInput(props: {
  value: string;
  onInput: (v: string) => void;
  items: string[];
  class?: string;
  placeholder?: string;
  type?: string;
  min?: number;
  list?: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const [rect, setRect] = createSignal<DOMRect | null>(null);
  let input!: HTMLInputElement;

  const matches = createMemo(() => {
    const q = props.value.trim().toLowerCase();
    const list = props.items ?? [];
    return (q ? list.filter((i) => i.toLowerCase().includes(q) && i.toLowerCase() !== q) : list)
      .slice(0, MAX_VISIBLE);
  });
  const showing = () => open() && matches().length > 0;

  // The panel is fixed-positioned, so it has to follow the input when an
  // ancestor scrolls — the builder lives inside a scrolling modal body.
  const track = () => setRect(input.getBoundingClientRect());
  function start() {
    track();
    setActive(0);
    setOpen(true);
    window.addEventListener("scroll", track, true);
    window.addEventListener("resize", track);
  }
  function stop() {
    setOpen(false);
    window.removeEventListener("scroll", track, true);
    window.removeEventListener("resize", track);
  }
  onCleanup(stop);

  const choose = (v: string) => {
    props.onInput(v);
    stop();
  };

  const onKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = (e) => {
    if (!showing()) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = matches().length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(matches()[active()]);
    } else if (e.key === "Escape") {
      stop();
    }
  };

  return (
    <>
      <input
        ref={input}
        type={props.type ?? "text"}
        min={props.min}
        value={props.value}
        placeholder={props.placeholder}
        class={props.class}
        role={props.items?.length ? "combobox" : undefined}
        aria-expanded={props.items?.length ? showing() : undefined}
        autocomplete="off"
        onFocus={start}
        onBlur={stop}
        onKeyDown={onKeyDown}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          setActive(0);
          if (!open()) start();
        }}
      />

      <Show when={showing() && rect()}>
        {(r) => (
          <Portal mount={topLayer()}>
            <div
              role="listbox"
              style={`position:fixed;top:${r().bottom + 4}px;left:${r().left}px;min-width:${r().width}px;max-width:min(20rem,calc(100vw - 2rem));z-index:9999`}
              class="bg-surface border border-rim rounded-xl shadow-2xl overflow-hidden py-1"
            >
              <For each={matches()}>
                {(item, i) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={i() === active()}
                    // Keeps focus in the input, so blur doesn't close the panel
                    // out from under the click.
                    onMouseDown={(e) => { e.preventDefault(); choose(item); }}
                    onMouseEnter={() => setActive(i())}
                    class={`w-full px-3 py-1.5 text-left text-sm truncate transition-colors ${
                      i() === active() ? "bg-accent-muted text-txt" : "text-muted hover:text-txt"
                    }`}
                  >
                    {item}
                  </button>
                )}
              </For>
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
