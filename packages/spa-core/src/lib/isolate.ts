// Gives a component its own <Suspense>, so a lazy chunk or a data read inside
// it can't suspend up to the page's boundary (Layout's, or a section shell's)
// and blank the whole page while a modal/panel loads. Wrap on-demand UI at
// its definition: `const X = isolate(lazy(() => import("./X")))`.
import { Suspense, createComponent, type Component } from "solid-js";

export const isolate = <P extends object>(C: Component<P>): Component<P> =>
  (props) =>
    createComponent(Suspense, {
      get children() {
        return createComponent(C, props);
      },
    });
