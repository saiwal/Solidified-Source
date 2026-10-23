// solidified's implementation of the search-field contract
// (spa-core types/ui.types.ts): the field, its magnifier and the clear button
// are one control, so every search box clears the same way and keeps a label.
import { Show, splitProps } from "solid-js";
import type { SearchFieldProps } from "@utsukta/spa-core/types/ui.types";
import { Input } from "@ui/Field";
import { IconButton } from "@ui/Button";
import { MdOutlineSearch, MdFillClose } from "solid-icons/md";

export function SearchField(props: SearchFieldProps) {
  const [own, rest] = splitProps(props, [
    "value",
    "onInput",
    "label",
    "clearLabel",
    "onSearch",
    "size",
    "class",
  ]);
  let inputEl: HTMLInputElement | undefined;

  const clear = () => {
    own.onInput("");
    queueMicrotask(() => inputEl?.focus());
  };

  return (
    <div class={`hz-search relative ${own.class ?? ""}`}>
      <MdOutlineSearch
        aria-hidden="true"
        class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
      />
      <Input
        {...rest}
        ref={(el) => (inputEl = el)}
        type="search"
        size={own.size}
        class="w-full !pl-8 !pr-9"
        value={own.value}
        aria-label={own.label}
        onInput={(e) => own.onInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && own.onSearch) {
            e.preventDefault();
            own.onSearch(own.value);
          }
        }}
      />
      <Show when={own.value}>
        <IconButton
          label={own.clearLabel}
          size="sm"
          disabled={rest.disabled}
          class="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={clear}
        >
          <MdFillClose class="w-3.5 h-3.5" />
        </IconButton>
      </Show>
    </div>
  );
}
