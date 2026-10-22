// solidified's implementation of the avatar contract (spa-core types/ui.types.ts).
// Sizes go through inline style (size 8 = 2rem), so any of the many sizes the
// app uses works without a Tailwind class having to exist for it.
import { Show, createEffect, createSignal, on, splitProps } from "solid-js";
import { MdFillPerson } from "solid-icons/md";
import { avatarHue, initials } from "@utsukta/spa-core/lib/avatar";
import type { AvatarProps } from "@utsukta/spa-core/types/ui.types";

export function Avatar(props: AvatarProps) {
  const [own, rest] = splitProps(props, ["src", "name", "size", "shape", "alt", "class", "style"]);
  const [failed, setFailed] = createSignal(false);
  // A new photo URL gets a fresh chance to load.
  createEffect(on(() => own.src, () => setFailed(false), { defer: true }));

  const rem = () => (own.size ?? 8) / 4;
  const photo = () => !!own.src && !failed();
  const hue = () => avatarHue(own.name ?? "");

  return (
    <span
      role={own.alt && !photo() ? "img" : undefined}
      aria-label={own.alt && !photo() ? own.alt : undefined}
      class={
        `hz-avatar inline-flex shrink-0 items-center justify-center overflow-hidden select-none font-semibold leading-none ` +
        `${own.shape === "rounded" ? "rounded-lg" : "rounded-full"} ${!photo() && !own.name ? "bg-elevated text-muted" : ""} ${own.class ?? ""}`
      }
      style={{
        width: `${rem()}rem`,
        height: `${rem()}rem`,
        "font-size": `${rem() * 0.38}rem`,
        // Tint only behind initials — a photo with alpha must show whatever the
        // row sits on, not a disc of its own.
        ...(!photo() && own.name ? { background: `hsl(${hue()}, 55%, 82%)`, color: `hsl(${hue()}, 45%, 35%)` } : {}),
        ...(typeof own.style === "object" ? own.style : {}),
      }}
      {...rest}
    >
      <Show
        when={photo()}
        fallback={
          <Show when={own.name} fallback={<MdFillPerson size={`${rem() * 0.6}rem`} aria-hidden="true" />}>
            <span aria-hidden="true">{initials(own.name!)}</span>
          </Show>
        }
      >
        <img
          src={own.src!}
          alt={own.alt ?? ""}
          loading="lazy"
          decoding="async"
          class="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      </Show>
    </span>
  );
}
