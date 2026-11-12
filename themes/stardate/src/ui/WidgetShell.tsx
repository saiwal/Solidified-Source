// LCARS's only widget frame. uiShadow resolves @ui/WidgetShell here in this
// theme, so Settings → widget style has no effect: every widget renders this
// look through the default's ShellView (same header, tabs and footer wiring).
// A pill bar with the label at the left and its actions at the right end,
// black on a colour fill, and a rail
// that leaves it down the body's left edge into a rounded foot — the elbow,
// so a column of widgets reads as one frame. The fill is --ws-lcars, which
// ../index.css cycles per widget, else orange.
import type { WidgetShellProps } from "@utsukta/spa-core/types/ui.types";
import { ShellView, type Look } from "@ui-base/WidgetShell";

export * from "@ui-base/WidgetShell";

const PANEL = "flex min-h-0 flex-1 flex-col overflow-hidden";

const LCARS: Look = {
  root: "hz-ws-lcars [--ws-px:0.75rem]",
  header: "gap-2 min-h-7 pl-3 pr-1 rounded-full bg-(--ws-lcars,var(--lcars-orange)) text-black",
  title:
    "flex-1 min-w-0 truncate text-left text-[0.8125rem] font-semibold uppercase tracking-wider text-black",
  actions: "flex items-center [&_a]:!text-black [&_button]:!text-black",
  footer: "justify-end px-(--ws-px) pt-1 pb-2",
  noIcon: true,
  panel: (titled) =>
    `${PANEL} ml-1.5 border-l-[6px] border-(--ws-lcars,var(--lcars-orange)) rounded-bl-2xl ${titled ? "mt-1" : ""}`,
};

export function WidgetShell(props: WidgetShellProps) {
  return <ShellView {...props} look={LCARS} />;
}
