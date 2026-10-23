import { Show } from "solid-js";
import { A } from "@solidjs/router";
import DOMPurify from "dompurify";

// ── Brand / site banner ────────────────────────────────────────────────────────
// Shared by the desktop rail and the mobile "more" drawer so both show the same
// banner/logo treatment.
export default function BrandBlock(props: { banner?: string; logoUrl?: string }) {
  return (
    <A href="/" class="flex items-center gap-3 select-none">
      <img
        src={props.logoUrl || import.meta.env.BASE_URL + "hubzilla.svg"}
        alt=""
        aria-hidden="true"
        class="h-6 w-6 shrink-0 rounded object-contain"
      />
      <span class="h-5 w-px bg-rim" />
      <Show
        when={props.banner}
        fallback={
          <span class="text-sm font-medium tracking-tight text-muted">
            Hubzilla
          </span>
        }
      >
        <span
          class="text-sm font-medium tracking-tight text-muted"
          innerHTML={DOMPurify.sanitize(props.banner!, {
            FORBID_TAGS: ["style", "script"],
          })}
        />
      </Show>
    </A>
  );
}
