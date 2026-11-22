import { lazy, createEffect, createMemo, Loading, Show } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { useLocation, useNavigate } from "@solidjs/router";
import SubPageLayout from "@/shared/views/SubPageLayout";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { ADMIN_ITEMS } from "../index";

const SECTIONS: Record<string, ReturnType<typeof lazy>> = {
  summary:        lazy(() => import("./sections/SummarySection")),
  site:           lazy(() => import("./sections/SiteSection")),
  accounts:       lazy(() => import("./sections/AccountsSection")),
  "service-classes": lazy(() => import("./sections/ServiceClassesSection")),
  channels:       lazy(() => import("./sections/ChannelsSection")),
  security:       lazy(() => import("./sections/SecuritySection")),
  features:       lazy(() => import("./sections/FeaturesSection")),
  addons:         lazy(() => import("./sections/AddonsSection")),
  themes:         lazy(() => import("./sections/ThemesSection")),
  "inspect-queue":lazy(() => import("./sections/QueueSection")),
  queueworker:    lazy(() => import("./sections/QueueworkerSection")),
  "profile-fields":lazy(() => import("./sections/ProfileFieldsSection")),
  "db-updates":   lazy(() => import("./sections/DbUpdatesSection")),
  logs:           lazy(() => import("./sections/LogsSection")),
};

const DEFAULT_SECTION = "summary";

export default function AdminView() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Was <Navigate> as the Show fallback; router 2 has none. Waits for auth
  // to resolve instead of bouncing an admin during boot.
  createEffect(auth, (a) => { if (a && !a.isAdmin) navigate("/", { replace: true }); });

  const activeKey = createMemo<string>(() => {
    const seg = location.pathname.replace(/^\/admin\/?/, "").split("/")[0];
    return seg && seg in SECTIONS ? seg : DEFAULT_SECTION;
  });

  return (
    <Show when={auth()?.isAdmin}>
      <SubPageLayout base="/admin" items={ADMIN_ITEMS} activeKey={activeKey()} help={(p) => `admin.${p}`}>
        <Loading fallback={<SectionSkeleton />}>
          <Dynamic component={SECTIONS[activeKey()]} />
        </Loading>
      </SubPageLayout>
    </Show>
  );
}

function SectionSkeleton() {
  return (
    <div class="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-4 animate-pulse">
      <div class="h-5 w-40 rounded bg-elevated" />
      <div class="h-px w-full bg-rim" />
      <div class="space-y-3">
        <div class="h-4 w-3/4 rounded bg-elevated" />
        <div class="h-4 w-1/2 rounded bg-elevated" />
        <div class="h-4 w-2/3 rounded bg-elevated" />
      </div>
    </div>
  );
}
