import { registerModule } from "@utsukta/spa-core/module-registry";
import { subjectNickFromPath } from "@utsukta/spa-core/store/site-config";

// [[Title]] links (lib/wikilinks.ts) work whether or not the Graph feature is
// switched on, so their resolver route lives here, never gated.
registerModule({
  id: "wikilink",
  i18n: ["graph"],
  // Splat: a [[Wiki/Page]] target holds a "/", which a :param segment can't.
  routes: [{ path: "/link/*title", component: () => import("./LinkResolveView") }],
  permissions: [],
});

// A [[Title]] resolves against the channel whose page it was clicked on, which
// renderBody() can't know — stamp it on the link as the click happens. Capture
// phase, so it runs before the router's own anchor handler reads the href.
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a.wikilink") as HTMLAnchorElement | null;
    const nick = subjectNickFromPath(location.pathname);
    if (a && nick) a.href = `${a.pathname}?nick=${encodeURIComponent(nick)}`;
  }, true);
}
