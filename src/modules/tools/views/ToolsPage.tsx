import { createMemo, Loading } from "solid-js";
import { Dynamic } from "@solidjs/web";
import { useLocation } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { isModuleActive } from "@utsukta/spa-core/module-registry";
import { useInstalledApps } from "@utsukta/spa-core/store/nav-store";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";
import SubPageLayout from "@/shared/views/SubPageLayout";
import type { SubPageItem } from "@/shared/views/SubPageLayout";
import { TOOLS } from "../tools-registry";

export default function ToolsPage() {
  const { t } = useI18n();
  const location = useLocation();
  const installedApps = useInstalledApps();

  const visibleTools = createMemo(() =>
    TOOLS.filter((tool) => !tool.moduleId || isModuleActive(tool.moduleId, installedApps(), disabledFrontendModules())),
  );

  const items = createMemo<SubPageItem[]>(() =>
    visibleTools().map((tool) => ({
      path: tool.id,
      label: () => String(t(tool.labelKey)),
      icon: (() => { const I = tool.icon; return <I class="w-5 h-5 shrink-0" />; })(),
    })),
  );

  const activeKey = createMemo<string>(() => {
    const seg = location.pathname.replace(/^\/tools\/?/, "").split("/")[0];
    return visibleTools().some((tool) => tool.id === seg) ? seg : visibleTools()[0]?.id ?? TOOLS[0].id;
  });

  const activeComponent = createMemo(
    () => visibleTools().find((tool) => tool.id === activeKey())?.component ?? TOOLS[0].component,
  );

  return (
    <SubPageLayout base="/tools" items={items()} activeKey={activeKey()}>
      <div class="px-4 md:px-6 py-6">
        <Loading>
          <Dynamic component={activeComponent()} />
        </Loading>
      </div>
    </SubPageLayout>
  );
}
