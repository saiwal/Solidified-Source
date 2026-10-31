import { lazy, createMemo, onMount, Suspense, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useLocation, useNavigate } from "@solidjs/router";
import SubPageLayout from "@/shared/views/SubPageLayout";
import { useViewerRole } from "@utsukta/spa-core/store/site-config";
import { CONNECTIONS_ITEMS } from "../index";
import { Skeleton } from "@ui/Skeleton";

const SECTIONS: Record<string, ReturnType<typeof lazy>> = {
  "connections":    lazy(() => import("./sections/ConnectionsSection")),
  "hubs":           lazy(() => import("./sections/HubsSection")),
  "people":         lazy(() => import("./sections/DirectorySection")),
  "suggest":        lazy(() => import("./sections/SuggestSection")),
  "privacy-groups": lazy(() => import("./sections/PrivacyGroupsView")),
  "contact-roles":  lazy(() => import("./sections/ContactRolesSection")),
  "guest-access":   lazy(() => import("./sections/GuestAccessSection")),
  "sources":        lazy(() => import("./sections/SourcesSection")),
  "invite":         lazy(() => import("./sections/InviteSection")),
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

  // Router navigations run in a transition, which keeps the *previous*
  // section on screen (often mid-skeleton) until the next one's chunk lands —
  // so on a cold chunk you'd see the old section's skeleton, then the new
  // one's. Warming every chunk once the shell is up removes that wait.
  onMount(() => {
    const warm = () => [...Object.values(SECTIONS), PrivacyGroupDetail].forEach((c) => c.preload());
    if ("requestIdleCallback" in window) requestIdleCallback(warm);
    else setTimeout(warm, 1);
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
    <div class="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4">
      <Skeleton class="hidden md:block h-7 w-48" />
      <div class="space-y-0.5">
        {[...Array(5)].map(() => (
          <div class="flex items-center gap-3 px-3 py-2">
            <Skeleton rounded="full" tone="overlay" class="w-10 h-10 shrink-0" />
            <div class="flex-1 space-y-2">
              <Skeleton tone="overlay" class="h-3.5 w-1/3" />
              <Skeleton tone="overlay" class="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
