import { Navigate } from "@solidjs/router";

// The Invite app's URL is /invite; the UI lives as a directory section.
export default function InviteRedirect() {
  return <Navigate href="/directory/invite" />;
}
