// src/modules/articles/views/SeriesView.tsx
import { createSignal, createEffect, createUniqueId, Show, For } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { MdOutlineEdit, MdFillKeyboard_arrow_up, MdFillKeyboard_arrow_down } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { useViewerRole, usePageNick } from "@utsukta/spa-core/store/site-config";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { Modal, modalPanelClass } from "@ui/Modal";
import { SkeletonRows, BackLink } from "@/shared/views/ui";
import { Motion, pop } from "@/shared/views/anim";
import { fetchSeriesDetail, renameSeries, reorderSeries } from "../api";
import { articlePath } from "@/shared/lib/shareLinks";
import type { Post } from "@utsukta/spa-core/types/post.types";
import { Button, IconButton } from "@ui/Button";
import PageActions from "@/shared/views/layout/PageActions";
import { Input } from "@ui/Field";
import { EmptyState } from "@ui/EmptyState";

function RenameDialog(props: { name: string; onClose: () => void; onRename: (to: string) => Promise<void> }) {
  const { t } = useI18n();
  const id = createUniqueId();
  const [to, setTo] = createSignal(props.name);
  const [busy, setBusy] = createSignal(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const v = to().trim();
    if (!v || v === props.name) return props.onClose();
    setBusy(true);
    try {
      await props.onRename(v);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={props.onClose} labelledBy={id}>
      <Motion.form {...pop} onSubmit={submit} class={`${modalPanelClass("sm")} p-6 space-y-5`}>
        <h2 id={id} class="text-lg font-semibold text-txt">{t("articles.series_rename")}</h2>
        <Input
          class="w-full"
          type="text"
          required
          autofocus
          value={to()}
          onInput={(e) => setTo(e.currentTarget.value)}
          aria-label={t("articles.series_rename_prompt")}
        />
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>{t("articles.cancel")}</Button>
          <Button type="submit" disabled={busy()}>{t("articles.rename")}</Button>
        </div>
      </Motion.form>
    </Modal>
  );
}

export default function SeriesView() {
  const params = useParams<{ nick: string; name: string }>();
  const pageNick = usePageNick();
  const nick = () => params.nick || pageNick();
  const name = () => decodeURIComponent(params.name);
  const role = useViewerRole();
  const navigate = useNavigate();
  const { t } = useI18n();
  const isOwner = () => role() === "owner";
  const [renaming, setRenaming] = createSignal(false);

  const [data, { refetch }] = createQueryResource(
    "series-detail",
    () => ({ nick: nick(), name: name() }),
    ({ nick, name }) => fetchSeriesDetail(nick, name),
  );

  const [order, setOrder] = createSignal<Post[]>([]);
  createEffect(() => setOrder(data()?.articles ?? []));

  async function persistOrder(next: Post[]) {
    setOrder(next);
    try {
      await reorderSeries(nick(), name(), next.map((a) => a.uuid));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reorder failed");
      refetch();
    }
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...order()];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next);
  }

  async function rename(to: string) {
    await renameSeries(nick(), name(), to);
    setRenaming(false);
    navigate(`/articles/${nick()}/series/${encodeURIComponent(to)}`, { replace: true });
  }

  return (
    <div class="max-w-5xl mx-auto">
      <div class="max-w-3xl space-y-6">
        <BackLink fallback={`/articles/${nick()}/series`} label={t("articles.back")} />

        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-2xl font-bold text-txt">{name()}</h1>
            <Show when={!data.loading}>
              <p class="text-sm text-muted mt-1 tabular-nums">{t("articles.series_articles_count", { count: order().length })}</p>
            </Show>
          </div>
          <PageActions label={name()} actions={[
            { label: t("articles.series_rename"), icon: MdOutlineEdit, onClick: () => setRenaming(true), show: isOwner() },
          ]} />
        </div>

        <Show when={!data.loading} fallback={<SkeletonRows count={5} />}>
          <Show
            when={order().length > 0}
            fallback={<EmptyState>{t("articles.series_no_series")}</EmptyState>}
          >
            <ol class="space-y-0.5 -mx-3">
              <For each={order()}>
                {(article, i) => (
                  <li class="group flex items-center gap-3 rounded-xl px-3 py-1.5 hover:bg-elevated/40 transition-colors">
                    <span class="text-sm text-muted w-6 shrink-0 tabular-nums">{i() + 1}</span>
                    <A
                      href={articlePath(nick(), article)}
                      class="flex-1 min-w-0 truncate py-1 text-sm font-medium text-txt hover:text-accent-txt transition-colors"
                    >
                      {article.title || t("articles.untitled")}
                    </A>
                    <Show when={isOwner()}>
                      <div class="flex items-center shrink-0 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                        <IconButton
                          label={t("articles.move_up")}
                          disabled={i() === 0}
                          onClick={() => move(i(), -1)}
                        >
                          <MdFillKeyboard_arrow_up size={18} />
                        </IconButton>
                        <IconButton
                          label={t("articles.move_down")}
                          disabled={i() === order().length - 1}
                          onClick={() => move(i(), 1)}
                        >
                          <MdFillKeyboard_arrow_down size={18} />
                        </IconButton>
                      </div>
                    </Show>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </Show>
      </div>

      <Show when={renaming()}>
        <RenameDialog name={name()} onClose={() => setRenaming(false)} onRename={rename} />
      </Show>
    </div>
  );
}
