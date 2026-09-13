import { Navigate, useLocation } from "@solidjs/router";
import { connectionRequestId } from "@utsukta/spa-core/lib/notifyLink";

// Core redirects to /connections#<abook_id> after a successful follow (and
// plenty of classic links point there); the SPA keeps that list under
// /directory, where ?open=<abook_id> pops the connection editor — the same
// modal you get after adding someone from the search box.
export default function ConnectionsRedirectView() {
  const id = connectionRequestId("/connections" + useLocation().hash);
  return <Navigate href={id ? `/directory/connections?open=${id}` : "/directory/connections"} />;
}
