import { createEffect } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { openPost } from "@/shared/views/modal-host";

// The dashboard panels (perf stats, composer, drafts, upcoming events,
// messages) are registered as contentTop widgets in ../index.ts and rendered
// by Layout.tsx's <Slot name="contentTop" .../> above this view — that's what
// makes them user-rearrangeable/removable via the same edit-mode picker as
// every other widget.
//
// /hq/:uuid (classic HQ's permalink, where core's notification redirect lands)
// opens that item through ModalHost like every other opener — mounting
// PostDetailModal here directly skipped the host, so it ignored the user's
// default post mode and always came up as a centred modal. The view lives in
// the host and survives navigation, so the URL drops back to /hq at once.
export default function DashboardView() {
  const params = useParams<{ uuid?: string }>();
  const navigate = useNavigate();
  createEffect(() => {
    if (!params.uuid) return;
    openPost(params.uuid);
    navigate("/hq", { replace: true });
  });
  return null;
}
