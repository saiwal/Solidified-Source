// solidified's implementation of the field contract (spa-core types/ui.types.ts):
// one underlined look for text inputs, selects and textareas. No default width —
// the call site says w-full / w-36 / flex-1, so a width class never has to fight
// one baked in here. Every field also carries `hz-input` hook classes.
//
// <Field> wraps a label, hint and error around one of these. It hands its id
// down through context, so the label's `for`, the control's id and its
// aria-describedby line up without the call site passing anything.
import { Show, createContext, createUniqueId, onCleanup, splitProps, useContext } from "solid-js";
import type {
  FieldProps,
  FieldSize,
  InputProps,
  SelectProps,
  TextareaProps,
} from "@utsukta/spa-core/types/ui.types";

type FieldCtx = {
  claim: () => string | undefined;
  release: () => void;
  describedBy: () => string | undefined;
  invalid: () => boolean;
};
const FieldContext = createContext<FieldCtx>();

/**
 * The a11y attributes for a control inside a <Field>; explicit props still win.
 * Call once per component: Solid re-runs a function call inside a JSX spread on
 * every read, and only the first call gets the id.
 */
function fieldAttrs() {
  const ctx = useContext(FieldContext);
  if (!ctx) return {};
  // Only one control holds the id at a time: a Field around a row of two
  // inputs must not render a duplicate id. Released on unmount, so a control
  // remounted under a <Show> gets it back.
  const id = ctx.claim();
  if (id) onCleanup(ctx.release);
  return {
    id,
    get "aria-describedby"() { return ctx.describedBy(); },
    get "aria-invalid"() { return ctx.invalid() || undefined; },
  };
}

const SIZE: Record<FieldSize, string> = { md: "px-0 py-2 text-sm", sm: "px-0 py-1.5 text-xs" };

// Underline, not a box: only the bottom rule carries the field, and focus turns
// it into a 2px accent line via an inset shadow (no layout shift). Corners no
// longer apply; a field is a line, not a surface.
export function inputClass(size: FieldSize = "md"): string {
  return (
    `hz-input hz-input-${size} rounded-none border-x-0 border-t-0 border-b border-rim bg-transparent text-txt placeholder:text-muted ` +
    `focus:outline-none focus:border-accent focus:shadow-[inset_0_-2px_0_0_var(--color-accent)] ` +
    `aria-invalid:border-danger disabled:opacity-60 transition-colors ${SIZE[size]}`
  );
}

export function Input(props: InputProps) {
  const [own, rest] = splitProps(props, ["size", "class"]);
  const a11y = fieldAttrs();
  return <input {...a11y} class={`${inputClass(own.size)} ${own.class ?? ""}`} {...rest} />;
}

export function Select(props: SelectProps) {
  const [own, rest] = splitProps(props, ["size", "class"]);
  const a11y = fieldAttrs();
  return <select {...a11y} class={`${inputClass(own.size)} ${own.class ?? ""}`} {...rest} />;
}

export function Textarea(props: TextareaProps) {
  const [own, rest] = splitProps(props, ["size", "class"]);
  const a11y = fieldAttrs();
  return <textarea {...a11y} class={`${inputClass(own.size)} ${own.class ?? ""}`} {...rest} />;
}

export function Field(props: FieldProps) {
  const id = createUniqueId();
  let claimed = false;
  const noteId = `${id}-note`;
  const ctx: FieldCtx = {
    claim: () => (claimed ? undefined : ((claimed = true), id)),
    release: () => { claimed = false; },
    describedBy: () => (props.error || props.hint ? noteId : undefined),
    invalid: () => !!props.error,
  };
  const sm = () => props.size === "sm";
  return (
    <FieldContext.Provider value={ctx}>
      <div class={`hz-field ${sm() ? "space-y-1" : "space-y-1.5"} ${props.class ?? ""}`}>
        <label for={id} class={sm() ? "block text-xs font-medium text-muted" : "block text-sm font-medium text-txt"}>
          {props.label}
        </label>
        {props.children}
        <Show when={props.error || props.hint}>
          <p id={noteId} class={props.error ? "text-xs text-danger-txt" : "text-xs text-muted"}>
            {props.error || props.hint}
          </p>
        </Show>
      </div>
    </FieldContext.Provider>
  );
}
