import { lazy, createMemo, Suspense, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useLocation, useNavigate } from "@solidjs/router";
import SubPageLayout from "@/shared/views/SubPageLayout";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { CONNECTIONS_ITEMS } from "../index";

const SECTIONS: Record<string, ReturnType<typeof lazy>> = {
  "connections":    lazy(() => import("./sections/ConnectionsSection")),
  "hubs":           lazy(() => import("./sections/HubsSection")),
  "people":         lazy(() => import("./sections/DirectorySection")),
  "suggest":        lazy(() => import("./sections/SuggestSection")),
  "privacy-groups": lazy(() => import("./sections/PrivacyGroupsView")),
  "contact-roles":  lazy(() => import("./sections/ContactRolesSection")),
  "guest-access":   lazy(() => import("./sections/GuestAccessSection")),
};

const PrivacyGroupDetail = lazy(() => import("./sections/PrivacyGroupDetailView"));

const DEFAULT_BY_ROLE: Partial<Record<string, string>> = {
  owner:     "connections",
  local:     "people",
  remote:    "people",
  anonymous: "people",
};

export default function ConnectionsShellView() {
  const location = useLocation();
  const navigate = useNavigate();
  const role = useViewerRole();

  // parts[0] = section slug, parts[1] = optional id
  // e.g. /directory/privacy-groups/26  →  ["privacy-groups", "26"]
  //      /directory/privacy-groups     →  ["privacy-groups"]
  //      /directory                    →  []
  const pathParts = createMemo<string[]>(() =>
    location.pathname.replace(/^\/directory\/?/, "").split("/").filter(Boolean)
  );

  const activeKey = createMemo<string>(() => {
    const seg = pathParts()[0] ?? "";
    if (seg && seg in SECTIONS) return seg;
    return DEFAULT_BY_ROLE[role()] ?? "people";
  });

  // Id is whatever sits after the section slug in the URL — no useParams needed.
  const groupId = createMemo<string | null>(() => {
    if (activeKey() !== "privacy-groups") return null;
    return pathParts()[1] ?? null;
  });

  return (
    <SubPageLayout base="/directory" items={CONNECTIONS_ITEMS} activeKey={activeKey()}>
      <Suspense fallback={<SectionSkeleton />}>
        <Show
          when={groupId() !== null}
          fallback={<Dynamic component={SECTIONS[activeKey()]} />}
        >
          <PrivacyGroupDetail
            id={groupId()!}
            onDeleted={() => navigate("/directory/privacy-groups", { replace: true })}
          />
        </Show>
      </Suspense>
    </SubPageLayout>
  );
}

function SectionSkeleton() {
  return (
    <div class="px-4 md:px-6 py-6 space-y-4 animate-pulse">
      <div class="h-5 w-40 rounded bg-elevated" />
      <div class="h-px w-full bg-rim" />
      <div class="space-y-3">
        {[...Array(5)].map(() => (
          <div class="rounded-lg border border-rim bg-surface p-3 flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-overlay shrink-0" />
            <div class="flex-1 space-y-2">
              <div class="h-3.5 bg-overlay rounded w-1/3" />
              <div class="h-3 bg-overlay rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
