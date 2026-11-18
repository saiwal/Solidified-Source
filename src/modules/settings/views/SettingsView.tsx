import { lazy, createMemo, Loading } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { useLocation } from "@solidjs/router";
import SubPageLayout from "@/shared/views/SubPageLayout";
import { SETTINGS_ITEMS } from "../index";

// ── Lazy section components ──────────────────────────────────────────────────

const SECTIONS: Record<string, ReturnType<typeof lazy>> = {
	profile:       lazy(() => import("./sections/ProfileSection")),
  account:       lazy(() => import("./sections/AccountSection")),
  channel:       lazy(() => import("./sections/ChannelSection")),
  privacy:       lazy(() => import("./sections/PrivacySection")),
  locations:     lazy(() => import("./sections/LocationsSection")),
  notifications: lazy(() => import("./sections/NotificationsSection")),
  display:       lazy(() => import("./sections/DisplaySection")),
  integrations:  lazy(() => import("./sections/IntegrationsSection")),
  features:      lazy(() => import("./sections/FeaturesSection")),
  blocked:       lazy(() => import("./sections/BlockedChannelsSection")),
  portability:   lazy(() => import("./sections/PortabilitySection")),
  danger:        lazy(() => import("./sections/DangerSection")),
};

const DEFAULT_SECTION = "display";

// ── View ─────────────────────────────────────────────────────────────────────

export default function SettingsView() {
  const location = useLocation();

  const activeKey = createMemo<string>(() => {
    const seg = location.pathname.replace(/^\/settings\/?/, "").split("/")[0];
    return seg && seg in SECTIONS ? seg : DEFAULT_SECTION;
  });

  return (
    <SubPageLayout base="/settings" items={SETTINGS_ITEMS} activeKey={activeKey()}>
      <Loading fallback={<SectionSkeleton />}>
        <Dynamic component={SECTIONS[activeKey()]} />
      </Loading>
    </SubPageLayout>
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
