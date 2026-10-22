# src/ui — your overrides of the @ui primitives

Modules import `Button`, `Input`, `Card`, `Modal`, `Menu`, … from `@ui/<Name>`.
Each import resolves to `src/ui/<Name>.tsx` **in this folder if the file
exists**, and to the default implementation in `@utsukta/spa-ui` otherwise
(`uiShadow` in `vite.config.ts`; `tsconfig.app.json` mirrors it for the editor).

So this folder starts empty and you add only what you want to change:

```tsx
// src/ui/Button.tsx — replace the look, keep the contract
import { splitProps } from "solid-js";
import type { ButtonProps } from "@utsukta/spa-core/types/ui.types";
export * from "@ui-base/Button";          // everything you don't override
export function Button(props: ButtonProps) {
  const [own, rest] = splitProps(props, ["variant", "size", "class", "type"]);
  return <button type={own.type ?? "button"} class={`btn btn-${own.variant ?? "primary"} ${own.class ?? ""}`} {...rest} />;
}
```

- The contract every override must satisfy is `@utsukta/spa-core/types/ui.types`.
- `@ui-base/<Name>` is always the default — import it to wrap rather than replace.
- An override also applies *inside* other primitives (Modal's close button and
  Menu's trigger use `@ui/Button`), so replacing a file is enough.
- Adding or deleting a file here restarts the dev server (resolution changes).
- `node ../../scripts/check-ui.mjs` checks the defaults' accessibility wiring;
  keep the same roles/ids/aria in your overrides.
