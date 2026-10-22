import { createSignal, Show, type Component } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { useCategoryTags } from "@/shared/editor/components/useCategoryTags";
import CategoryTagsField from "@/shared/editor/components/CategoryTagsField";
import { getCategories, setCategories as saveCategories } from "../api";
import type { FileMeta } from "../api";
import { Modal, ModalPanel } from "@ui/Modal";
import { Button } from "@ui/Button";

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

  return (
    <Modal onClose={props.onClose} class="z-[60]">
      <ModalPanel
        title={<>{t("files_mod.categories")} — <span class="font-normal text-muted"> {bulk() ? t("files_mod.selected_count", { count: bulk()!.length }) : props.item.filename} </span></>}
        onClose={props.onClose}
        size="md"
        class="overflow-hidden"
      >
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
            <p class="text-sm text-danger-txt mt-2">{err()}</p>
          </Show>
        </div>
        <footer class="flex gap-2 px-4 py-3 border-t border-rim bg-elevated">
          <Button
            size="sm"
            onClick={save}
            disabled={busy() || !loaded() || (!!bulk() && !tags.categoryTags().length)}
          >
            {busy() ? t("files_mod.saving") : t("files_mod.save")}
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onClose}>
            {t("files_mod.cancel")}
          </Button>
        </footer>
      </ModalPanel>
    </Modal>
  );
};

export default CategoriesModal;
