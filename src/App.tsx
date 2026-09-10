import { lazy, For, Show, createEffect, createMemo, type Component, type ParentComponent } from "solid-js";
import { Router, Route, useNavigate, useLocation } from "@solidjs/router";
import { QueryClientProvider } from "@tanstack/solid-query";
import Layout from "./Layout";
import { getRoutes } from "./router";
import { I18nProvider, useI18n, hasStoredLocalePreference, resolveSupportedLocale } from "@utsukta/spa-core/i18n";
import NotFound from "@/shared/views/NotFound";
import { getModule, isModuleActive } from "@utsukta/spa-core/module-registry";
import { useInstalledApps, useNavData } from "@utsukta/spa-core/store/nav-store";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { disabledFrontendModules } from "@utsukta/spa-core/store/disabled-frontend-modules";
import { queryClient } from "@utsukta/spa-core/lib/query-client";

const QueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@tanstack/solid-query-devtools").then((m) => ({
        default: m.SolidQueryDevtools,
      })),
    )
  : () => null;

import.meta.glob("./modules/*/index.ts", { eager: true });


// Logo / "/" must not dump a visitor on the login page. Mirrors core's
// Home.php: members go to their startpage (channel, then admin/site
// "Preferred page for members"), visitors to admin/site "Site homepage"
// (system.frontpage) — falling back to /hq and the public stream.
// "include:<file>" is a server-rendered frontpage the SPA can't route to;
// treated as unset.
function resolveLanding(value: string): string | null {
  const v = value.trim();
  if (!v || v.startsWith("include:")) return null;
  if (/^https?:\/\//.test(v)) {
    const url = new URL(v);
    // Off-site frontpage: leave the SPA entirely.
    return url.origin === window.location.origin ? url.pathname + url.search : v;
  }
  return v.startsWith("/") ? v : "/" + v;
}

function RootRedirect() {
  const auth = useAuth();
  const navData = useNavData();
  const navigate = useNavigate();

  createEffect(() => {
    const a = auth();
    const nav = navData();
    if (!a || !nav) return; // still resolving — don't guess

    const dest = a.isLocal
      ? resolveLanding(nav.viewer?.startpage || nav.startpage) ?? "/hq"
      : resolveLanding(nav.frontpage) ??
        (nav.has_public_stream ? "/pubstream" : "/login");

    if (/^https?:\/\//.test(dest)) window.location.href = dest;
    else navigate(dest, { replace: true });
  });

  return null;
}

const ModuleGuard: ParentComponent<{ moduleId: string }> = (props) => {
  const installedApps = useInstalledApps();
  const navigate = useNavigate();

  const active = createMemo(() =>
    isModuleActive(props.moduleId, installedApps(), disabledFrontendModules()),
  );

  createEffect(() => {
    if (!active()) navigate("/", { replace: true });
  });

  return <Show when={active()}>{props.children}</Show>;
};

// null = auth state not yet resolved (singleton resource still loading) — render
// nothing but don't redirect yet, to avoid a flash-redirect on page load.
const AuthGuard: ParentComponent = (props) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const loggedIn = createMemo(() => auth()?.isLoggedIn ?? null);

  createEffect(() => {
    if (loggedIn() === false) {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/login?next=${next}`, { replace: true });
    }
  });

  return <Show when={loggedIn() !== false}>{props.children}</Show>;
};

// One-time seed: if the user has never picked a language in the SPA itself,
// adopt whatever classic Hubzilla is currently using for this session
// (App::$language, from /spa/nav) instead of always defaulting to English.
// Once set, this becomes an explicit preference and stops re-syncing.
const LocaleSync: Component = () => {
  const navData = useNavData();
  const { setLocale } = useI18n();

  createEffect(() => {
    const data = navData();
    if (!data || hasStoredLocalePreference()) return;
    setLocale(resolveSupportedLocale(data.language));
  });

  return null;
};

export default function App() {
  return (
  <QueryClientProvider client={queryClient}>
  <I18nProvider>
    <LocaleSync />
    <Router>
      <Route path="/" component={Layout}>
        <Route path="/" component={RootRedirect} />
        <For each={getRoutes()()}>
          {(route) => {
            const Comp = lazy(route.component);
            const mid = route.moduleId;
            const mod = mid ? getModule(mid) : null;

            let Rendered: Component = Comp;
            if (mod?.appUrlSlug || mod?.frontendFeature) {
              const Inner = Rendered;
              Rendered = () => <ModuleGuard moduleId={mid!}><Inner /></ModuleGuard>;
            }
            if (mod?.requiresAuth) {
              const Inner = Rendered;
              Rendered = () => <AuthGuard><Inner /></AuthGuard>;
            }
            return <Route path={route.path} component={Rendered} />;
          }}
        </For>
        <Route path="*404" component={NotFound} />
      </Route>
    </Router>
    <QueryDevtools />
  </I18nProvider>
  </QueryClientProvider>
  );
}
