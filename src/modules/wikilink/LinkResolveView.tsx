// /link/:title?nick= — where a rendered [[Title]] points. Resolves the title
// against that channel's content and replaces itself with the target; a title
// nothing answers to shows a "not written yet" page, as in Obsidian.
import { createResource, Show } from "solid-js";
import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { cardClass } from "@ui/Card";
import { EmptyState } from "@ui/EmptyState";
import { Spinner } from "@ui/Spinner";
import { resolveTitle } from "@/modules/graph/api";

export default function LinkResolveView() {
  const { t } = useI18n();
  const params = useParams();
  const [search] = useSearchParams();
  const auth = useAuth();
  const navigate = useNavigate();
  // The router may hand the splat back encoded or not; decode only if valid.
  const title = () => {
    const raw = params.title ?? "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };
  const nick = () => String(search.nick ?? "") || auth()?.nick || "";

  const [target] = createResource(
    () => (nick() && title() ? { nick: nick(), title: title() } : null),
    async ({ nick, title }) => {
      const { url } = await resolveTitle(nick, title);
      if (url) navigate(url, { replace: true });
      return url;
    },
  );

  return (
    <div class="p-3 md:p-4">
      <div class={`${cardClass()} p-6`}>
        <Show when={!target.loading && target() === null || target.error} fallback={
          <div class="flex items-center gap-3 text-muted"><Spinner /> {t("graph.resolving", { title: title() })}</div>
        }>
          <EmptyState size="md">
            <p class="font-medium text-txt">{t("graph.missing_page", { title: title() })}</p>
            <p class="text-sm text-muted mt-1">{t("graph.missing_hint")}</p>
          </EmptyState>
        </Show>
      </div>
    </div>
  );
}
