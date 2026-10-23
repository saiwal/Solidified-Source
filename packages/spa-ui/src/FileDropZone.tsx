// solidified's implementation of the file-drop-zone contract
// (spa-core types/ui.types.ts). A label wraps the native file input (click to
// browse, keyboard reachable) and the same surface is a drop target.
import { Show, createSignal } from "solid-js";
import type { FileDropZoneProps } from "@utsukta/spa-core/types/ui.types";
import { MdOutlineCloud_upload } from "solid-icons/md";

export function FileDropZone(props: FileDropZoneProps) {
  const [dragging, setDragging] = createSignal(false);
  let input: HTMLInputElement | undefined;

  const add = (files: FileList | null) => {
    if (props.disabled || !files?.length) return;
    props.onFiles(Array.from(files));
  };

  return (
    <label
      class={`hz-dropzone flex flex-col items-center justify-center gap-1 rounded-xl border-2
              border-dashed px-6 py-8 text-center transition-colors
              focus-within:ring-2 focus-within:ring-accent/40 focus-within:ring-offset-2
              focus-within:ring-offset-surface
              ${props.disabled
                ? "opacity-50 cursor-not-allowed border-rim bg-surface"
                : dragging()
                  ? "border-accent bg-accent/5 cursor-copy"
                  : "border-rim bg-surface hover:border-accent/60 cursor-pointer"}
              ${props.class ?? ""}`}
      onDragOver={(e) => {
        if (props.disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        if (props.disabled) return;
        e.preventDefault();
        setDragging(false);
        add(e.dataTransfer?.files ?? null);
      }}
    >
      <input
        ref={input}
        type="file"
        class="sr-only"
        aria-label={props.label}
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        onChange={(e) => {
          add(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <Show
        when={props.children}
        fallback={
          <>
            <MdOutlineCloud_upload class="w-8 h-8 text-accent" aria-hidden="true" />
            <span class="text-sm font-semibold text-txt">{props.label}</span>
            <Show when={props.hint}>
              <span class="text-xs text-muted">{props.hint}</span>
            </Show>
          </>
        }
      >
        {props.children}
      </Show>
    </label>
  );
}
