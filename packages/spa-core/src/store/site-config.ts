// src/site-config-store.ts
import { createMemo } from "solid-js";
import { useLocation } from "@solidjs/router";
import { useAuth } from "./auth-store";

export type ViewerRole = "owner" | "local" | "remote" | "anonymous" | "admin";

/**
 * Derives the *subject* nick from the current URL.
 * /channel/alice  →  "alice"
 * /hq             →  "" (no subject)
 *
 * Call this inside a component or reactive context only.
 */
export function useSubjectNick(): () => string {
  const location = useLocation();
  return createMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    // Any route with shape /:module/:nick — channel, photos, etc.
    // parts[0] = module, parts[1] = nick
    const modulesWithNick = [
      "channel",
      "profile",
      "photos",
      "articles",
      "cards",
      "cart",
      "chat",
      "calendar",
      "cloud",
      "webpages",
      "wiki",
      "cal",
      "page",
      "messenger",
    ];
    if (parts[1] && modulesWithNick.includes(parts[0])) return parts[1];
    return "";
  });
}
/**
 * Derives the viewer's role relative to the current page subject.
 *
 * "owner"     — logged-in local user viewing their OWN channel
 * "local"     — logged-in local user viewing SOMEONE ELSE's channel
 * "remote"    — OWA/remote-authenticated visitor
 * "anonymous" — unauthenticated visitor
 *
 * Call this inside a component or reactive context only.
 */
export function useViewerRole(): () => ViewerRole {
  const auth = useAuth();
  const subjectNick = useSubjectNick();
  return createMemo((): ViewerRole => {
    const a = auth();

    // auth() is a singleton resource fetched once at boot — no stale-data risk.
    // We intentionally do NOT read navData here; navData is async and can be
    // stale mid-navigation, causing the role to flip back to "owner" briefly.
    if (!a || !a.isLoggedIn) return "anonymous";
    if (!a.isLocal) return "remote";

    if (subjectNick()) {
      return a.nick === subjectNick() ? "owner" : "local";
    }
    return "owner";
  });
}

/**
 * Convenience: returns the nick that should be used for API calls
 * targeting the *subject* of the current page.
 *
 * - On /channel/:nick  →  the URL nick (works for both owner & visitors)
 * - On /hq or other owner-only pages  →  the logged-in user's nick
 * - Anonymous on a non-channel page   →  ""
 */
export function usePageNick(): () => string {
  const auth = useAuth();
  const subjectNick = useSubjectNick();

  return createMemo(() => {
    const urlNick = subjectNick();
    if (urlNick) return urlNick; // always prefer the URL nick
    return auth()?.nick ?? ""; // fall back to logged-in user's nick
  });
}
export function useIsAdmin(): () => boolean {
  const auth = useAuth();
  return createMemo(() => auth()?.isAdmin ?? false);
}
