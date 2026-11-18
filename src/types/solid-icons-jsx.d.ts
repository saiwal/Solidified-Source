// solid-icons 2.0.0 still types itself against `JSX` from "solid-js", which
// Solid 2 moved to "@solidjs/web" — without this every icon's props resolve
// to nothing. ponytail: delete once solid-icons imports JSX from @solidjs/web.
import type { JSX as WebJSX } from "@solidjs/web";

declare module "solid-js" {
  namespace JSX {
    type Element = WebJSX.Element;
    type SVGElementTags = WebJSX.SVGElementTags;
    type CSSProperties = WebJSX.CSSProperties;
  }
}
