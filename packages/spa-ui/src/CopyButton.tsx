// solidified's implementation of the copy-button contract
// (spa-core types/ui.types.ts): one clipboard path instead of a copied signal,
// a timer and a check icon re-implemented at every call site.
import { Show, createSignal, onCleanup, splitProps } from "solid-js";
import type { CopyButtonProps } from "@utsukta/spa-core/types/ui.types";
import { IconButton } from "@ui/Button";
import { MdOutlineContent_copy, MdOutlineCheck } from "solid-icons/md";

export function CopyButton(props: CopyButtonProps) {
  const [own, rest] = splitProps(props, [
    "value",
    "label",
    "copiedLabel",
    "timeout",
    "onCopied",
    "onError",
    "class",
  ]);
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  async function copy() {
    const text = typeof own.value === "function" ? own.value() : own.value;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), own.timeout ?? 1500);
      own.onCopied?.();
    } catch (error) {
      own.onError?.(error);
    }
  }

  return (
    <>
      <IconButton
        label={copied() ? own.copiedLabel : own.label}
        class={own.class}
        {...rest}
        onClick={copy}
      >
        <Show when={copied()} fallback={<MdOutlineContent_copy class="w-4 h-4" />}>
          <MdOutlineCheck class="w-4 h-4 text-accent" />
        </Show>
      </IconButton>
      <span class="sr-only" role="status">
        {copied() ? own.copiedLabel : ""}
      </span>
    </>
  );
}
