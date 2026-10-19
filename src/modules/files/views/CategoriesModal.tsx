import { createSignal, Show, type Component, createUniqueId } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useCategoryTags } from "@/shared/editor/components/useCategoryTags";
import CategoryTagsField from "@/shared/editor/components/CategoryTagsField";
import { getCategories, setCategories as saveCategories } from "../api";
import type { FileMeta } from "../api";
import Modal from "@/shared/views/Modal";

interface Props {
  item: FileMeta;
  /** A multi-selection: the entered categories are added to each, keeping
   *  what every item already has, rather than replacing one item's set. */
  items?: FileMeta[];
  nick: string;
  /** Items that failed to save (bulk only; always empty for one item). */
  onSaved: (failed: FileMeta[]) => void;
  onClose: () => void;
}

const CategoriesModal: Component<Props> = (props) => {
  const { t } = useI18n();
  const [category, setCategory] = createSignal("");
  const [loaded, setLoaded] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [err, setErr] = createSignal("");

  const bulk = () => props.items;
  if (bulk()) setLoaded(true);
  else getCategories(props.nick, props.item.hash)
    .then((cats) => { setCategory(cats.join(",")); setLoaded(true); })
    .catch((e) => setErr((e as Error).message));

  const tags = useCategoryTags(category, setCategory);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const items = bulk();
      if (!items) {
        await saveCategories(props.nick, props.item.hash, tags.categoryTags());
        props.onSaved([]);
        return;
      }
      // Sequential, like bulk move/delete: no batch endpoint, and one failure
      // shouldn't abandon the rest.
      const failed: FileMeta[] = [];
      for (const it of items) {
        try {
          const have = await getCategories(props.nick, it.hash);
          await saveCategories(props.nick, it.hash, [...new Set([...have, ...tags.categoryTags()])]);
        } catch {
          failed.push(it);
        }
      }
      props.onSaved(failed);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const titleId = createUniqueId();
  return (
    <Modal onClose={props.onClose} labelledBy={titleId} class="z-[60]">
      <div class="w-full max-w-md rounded-xl border border-rim bg-surface shadow-2xl overflow-hidden">
        <header class="flex items-center justify-between px-4 py-3 border-b border-rim">
          <span id={titleId} class="text-sm font-semibold text-txt truncate">
            {t("files_mod.categories")} — <span class="font-normal text-muted">
              {bulk() ? t("files_mod.selected_count", { count: bulk()!.length }) : props.item.filename}
            </span>
          </span>
          <button onClick={props.onClose} class="text-muted hover:text-txt text-lg leading-none shrink-0 ml-2" aria-label={t("layout.close")}>
            ×
          </button>
        </header>
        <div class="p-4">
          <Show when={loaded()} fallback={<p class="text-sm text-muted">…</p>}>
            <CategoryTagsField
              tags={tags.categoryTags}
              pending={tags.pendingCategory}
              onPendingInput={tags.setPendingCategory}
              onKeyDown={tags.onCategoryKeyDown}
              onRemove={tags.removeCategoryTag}
              onBlur={() => {
                if (tags.pendingCategory().trim()) tags.addCategoryTag(tags.pendingCategory());
              }}
              placeholder={t("files_mod.categories_placeholder") as string}
              showLabel
              label={t("files_mod.categories") as string}
            />
          </Show>
          <Show when={bulk()}>
            <p class="text-xs text-muted mt-2">{t("files_mod.categories_bulk_hint")}</p>
          </Show>
          <Show when={err()}>
            <p class="text-sm text-red-500 mt-2">{err()}</p>
          </Show>
        </div>
        <footer class="flex gap-2 px-4 py-3 border-t border-rim bg-elevated">
          <button
            onClick={save}
            disabled={busy() || !loaded() || (!!bulk() && !tags.categoryTags().length)}
            class="px-4 py-1.5 rounded-lg bg-accent text-accent-fg text-sm
                   disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {busy() ? t("files_mod.saving") : t("files_mod.save")}
          </button>
          <button
            onClick={props.onClose}
            class="px-4 py-1.5 rounded-lg border border-rim text-sm text-muted
                   hover:bg-overlay transition-colors"
          >
            {t("files_mod.cancel")}
          </button>
        </footer>
      </div>
    </Modal>
  );
};

export default CategoriesModal;
