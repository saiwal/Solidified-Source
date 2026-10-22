import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchSiteInfo } from "../api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Badge } from "@ui/Badge";

// Every siteinfo widget calls this independently — TanStack Query dedupes
// the fetch and shares the cache under the "siteinfo" key, so this doesn't
// cause 7 separate network requests.
export function useSiteinfo() {
  const [info] = createQueryResource("siteinfo", fetchSiteInfo);
  return info;
}

// Caps each widget's card at a readable width and centers it — contentTop
// is full-width, and without this these cards stretch edge-to-edge on
// large screens instead of reading as a narrow, centered column.
export function Centered(props: { children: any }) {
  return <div class="max-w-3xl mx-auto">{props.children}</div>;
}

export function Section(props: { title: string; children: any; compact?: boolean }) {
  return (
    <section class={`rounded-xl border border-rim bg-surface ${props.compact ? "p-4" : "p-6"}`}>
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

export function Chip(props: { label: string; variant?: "info" | "default" }) {
  const cls = () => props.variant === "info"
    ? "bg-accent-muted text-accent"
    : "bg-overlay text-muted";
  return (
    <span class={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls()}`}>
      {props.label}
    </span>
  );
}

export function RegistrationBadge(props: { policy: 0 | 1 | 2 }) {
  const { t } = useI18n();
  const label = () =>
    props.policy === 1 ? t("ui.siteinfo_open_reg")
    : props.policy === 2 ? t("ui.siteinfo_approval")
    : t("ui.siteinfo_closed");

  return (
    <Badge tone="accent">
      {label()}
    </Badge>
  );
}

export function humanBytes(n: number): string {
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(1)} GB`;
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
