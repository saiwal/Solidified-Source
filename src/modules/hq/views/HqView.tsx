import { lazy, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";

const PostDetailModal = lazy(() => import("@/shared/views/PostDetailModal"));

// The dashboard panels (perf stats, composer, drafts, upcoming events,
// messages) are registered as contentTop widgets in ../index.ts and rendered
// by Layout.tsx's <Slot name="contentTop" .../> above this view — that's what
// makes them user-rearrangeable/removable via the same edit-mode picker as
// every other widget.
//
// /hq/:uuid (classic HQ's permalink, where core's notification redirect lands)
// opens that item over the dashboard in the same modal MessageList uses.
export default function DashboardView() {
  const params = useParams<{ uuid?: string }>();
  const navigate = useNavigate();
  return (
    <Show when={params.uuid}>
      <PostDetailModal uuid={params.uuid!} onClose={() => navigate("/hq", { replace: true })} />
    </Show>
  );
}
