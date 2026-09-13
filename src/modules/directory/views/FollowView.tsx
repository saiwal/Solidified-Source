import { createEffect } from "solid-js";
import { useNavigate, useLocation, useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { toast } from "@utsukta/spa-core/store/toast";
import { connectToChannel } from "../connections/api";

// Landing page for classic Hubzilla's /follow?f=&interactive=1&url=<addr> links
// (pasted into webpages so a reader can add a channel in one click). Core's own
// Follow module handles the request whenever it reaches PHP with a local
// session and then redirects to /connections; this view covers the case where
// it does not — core rendered login() at /follow, so the SPA boots here.
export default function FollowView() {
  const [searchParams] = useSearchParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  const raw = searchParams.url;
  const url = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  let started = false;

  createEffect(() => {
    const a = auth();
    if (!a || started) return; // auth unresolved — isLoggedIn lies during boot

    if (!a.isLoggedIn) {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?next=${next}`, { replace: true });
      return;
    }

    started = true;

    if (!url) {
      toast.error(t("directory.follow_no_url"));
      navigate("/directory/connections", { replace: true });
      return;
    }
    if (!a.isLocal) {
      toast.error(t("directory.follow_needs_local"));
      navigate("/", { replace: true });
      return;
    }

    // ?open=<abook_id> makes the connections list pop the editor modal, which
    // is how adding someone from the search box already confirms itself.
    connectToChannel(url)
      .then(({ abook_id }) =>
        navigate(`/directory/connections?open=${abook_id}`, { replace: true }))
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : String(e));
        navigate("/directory/connections", { replace: true });
      });
  });

  return (
    <div class="flex items-center justify-center min-h-[40vh] p-6 text-center text-muted">
      {t("directory.follow_connecting")}
    </div>
  );
}

