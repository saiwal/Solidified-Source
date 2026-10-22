import { createSignal, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { MdFillSearch, MdFillClose } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Input } from "@ui/Field";

export default function NotepadHeaderWidget() {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTag = () => String(searchParams.tag ?? "");
  const activeDbegin = () => String(searchParams.dbegin ?? "");
  const activeSearch = () => String(searchParams.search ?? "");
  const hasFilters = () => !!(activeTag() || activeDbegin() || activeSearch());

  const [searchOpen, setSearchOpen] = createSignal(!!activeSearch());
  const [searchInput, setSearchInput] = createSignal(activeSearch());

  const submitSearch = (e?: Event) => {
    e?.preventDefault();
    const q = searchInput().trim();
    setSearchParams({ search: q || undefined });
    if (!q) setSearchOpen(false);
  };

  const clearAllFilters = () => {
    setSearchInput("");
    setSearchOpen(false);
    setSearchParams({
      tag: undefined,
      dbegin: undefined,
      dend: undefined,
      search: undefined,
    });
  };

  return (
    <>
      <div class="max-w-5xl mx-auto space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h1 class="text-xl font-bold text-txt">{t("notepad.title")}</h1>

          <Show
            when={searchOpen()}
            fallback={
              <button
                type="button"
                title={t("notepad.search")}
                onClick={() => {
                  setSearchInput(activeSearch());
                  setSearchOpen(true);
                }}
                class={`p-1.5 rounded-lg border transition-colors
                ${
                  activeSearch()
                    ? "bg-accent text-accent-fg border-accent"
                    : "border-rim bg-surface text-muted hover:bg-elevated hover:text-txt"
                }`}
              >
                <MdFillSearch size={15} />
              </button>
            }
          >
            <form onSubmit={submitSearch} class="flex items-center gap-1">
              <Input class="w-40" type="search" value={searchInput()} onInput={(e) => setSearchInput(e.currentTarget.value)} placeholder={t("notepad.search_placeholder")} autofocus onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                }} />
              <button
                type="submit"
                class="p-1.5 rounded-lg border border-rim bg-elevated text-txt hover:bg-overlay transition-colors"
              >
                <MdFillSearch size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearchParams({ search: undefined });
                  setSearchOpen(false);
                }}
                class="p-1.5 text-muted hover:text-txt transition-colors"
              >
                <MdFillClose size={15} />
              </button>
            </form>
          </Show>
        </div>
      </div>
      <div class="max-w-3xl mx-auto space-y-3">
        <Show when={hasFilters()}>
          <div class="flex items-center gap-2 text-sm text-muted">
            <Show when={activeSearch()}>
              <span>"{activeSearch()}"</span>
            </Show>
            <Show when={activeTag()}>
              <span>#{activeTag()}</span>
            </Show>
            <Show when={activeDbegin()}>
              <span>
                {new Date(`${activeDbegin()}T00:00:00`).toLocaleDateString(
                  locale(),
                  {
                    month: "long",
                    year: "numeric",
                  },
                )}
              </span>
            </Show>
            <button
              onClick={clearAllFilters}
              class="text-xs text-accent hover:underline"
            >
              {t("notepad.clear_filter")}
            </button>
          </div>
        </Show>
      </div>
    </>
  );
}
