// src/modules/help/widgets/HelpChooserWidget.tsx
import { createSignal, Show } from "solid-js";
import { useLocation, useNavigate, useSearchParams, A } from "@solidjs/router";
import { MdFillSearch, MdFillClose } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Input } from "@ui/Field";

export default function HelpChooserWidget() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const section = () => location.pathname.split("/").filter(Boolean)[1] || "user";

  const currentQuery = () => {
    const v = searchParams.q;
    return v ? String(Array.isArray(v) ? v[0] : v) : "";
  };
  const [query, setQuery] = createSignal(currentQuery());

  const submitSearch = (e: Event) => {
    e.preventDefault();
    const q = query().trim();
    if (q) navigate(`/help/${section()}?q=${encodeURIComponent(q)}`);
  };

  const clearSearch = () => {
    setQuery("");
    navigate(`/help/${section()}`);
  };

  const sections = [
    { id: "user", label: () => t("help.section_user") },
    { id: "admin", label: () => t("help.section_admin") },
    { id: "dev", label: () => t("help.section_dev") },
  ] as const;

  return (
    <div class="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
      <h1 class="text-lg font-semibold text-txt">{t("nav.help")}</h1>

      <div class="flex gap-1 p-1 bg-elevated rounded-lg w-fit mx-auto">
        {sections.map((s) => (
          <A
            href={`/help/${s.id}`}
            class={`px-3 text-center text-xs py-1 rounded-md transition-colors font-medium
              ${
                section() === s.id
                  ? "bg-accent text-accent-fg font-semibold"
                  : "text-muted hover:text-txt"
              }`}
          >
            {s.label()}
          </A>
        ))}
      </div>

      <form onSubmit={submitSearch} class="flex items-center gap-1">
        <Input
          class="w-40"
          type="search"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder={t("help.search_placeholder")}
        />
        <button
          type="submit"
          class="p-1.5 rounded-lg border border-rim bg-elevated text-txt hover:bg-overlay transition-colors"
        >
          <MdFillSearch size={15} />
        </button>
        <Show when={currentQuery()}>
          <button
            type="button"
            onClick={clearSearch}
            class="p-1.5 text-muted hover:text-txt transition-colors"
          >
            <MdFillClose size={15} />
          </button>
        </Show>
      </form>
    </div>
  );
}
