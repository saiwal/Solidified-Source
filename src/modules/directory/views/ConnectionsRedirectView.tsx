import { useNavigate, useLocation } from "@solidjs/router";
import { untrack } from "solid-js";
import { connectionRequestId } from "@utsukta/spa-core/lib/notifyLink";

// Core redirects to /connections#<abook_id> after a successful follow (and
// plenty of classic links point there); the SPA keeps that list under
// /directory, where ?open=<abook_id> pops the connection editor — the same
// modal you get after adding someone from the search box.
export default function ConnectionsRedirectView() {
  const location = useLocation();
  // A one-shot redirect: read the hash once.
  const id = connectionRequestId("/connections" + untrack(() => location.hash));
  useNavigate()(id ? `/directory/connections?open=${id}` : "/directory/connections", { replace: true });
  return null;
}
