import { useLocation } from "@solidjs/router";

// The articles module shares one moduleId across several distinct routed
// views (list, series index, series detail, article detail) — Layout.tsx's
// <Slot moduleId> only knows the module, not which route is active, so the
// module-default header/content widgets must hide themselves on routes they
// don't belong to or they'd render on top of those views' own content.

/** "list" for /articles[/:nick], "series" for /articles/:nick/series, else null. */
export function useArticlesSection(): () => "list" | "series" | null {
  const location = useLocation();
  return () => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "articles") return null;
    if (parts.length <= 2) return "list";
    return parts.length === 3 && parts[2] === "series" ? "series" : null;
  };
}

export function useIsArticlesList(): () => boolean {
  const section = useArticlesSection();
  return () => section() === "list";
}
