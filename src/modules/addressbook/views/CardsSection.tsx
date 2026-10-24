import { createMemo, createSignal, For, Show } from "solid-js";
import {
  MdOutlineAdd,
  MdOutlineDelete,
  MdOutlineEdit,
  MdOutlinePerson,
  MdOutlineSearch,
} from "solid-icons/md";
import SubPageContent from "@/shared/views/SubPageContent";
import PageActions from "@/shared/views/layout/PageActions";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import {
  deleteCard,
  fetchCards,
  type Addressbook,
  type Card,
  type CardsResponse,
} from "../api";
import CardEditorModal from "./CardEditorModal";
import { IconButton } from "@ui/Button";
import { Input } from "@ui/Field";
import { cardClass } from "@ui/Card";
import { Avatar } from "@ui/Avatar";

interface Props {
  book: Addressbook;
}

export default function CardsSection(props: Props) {
  const { t } = useI18n();

  const [data, { refetch }] = createQueryResource<CardsResponse, number>(
    "addressbook-cards",
    () => props.book.id,
    fetchCards,
  );

  const [query, setQuery] = createSignal("");
  const [editing, setEditing] = createSignal<Card | null>(null);
  const [creating, setCreating] = createSignal(false);

  const cards = createMemo<Card[]>(() => data()?.cards ?? []);

  const visible = createMemo<Card[]>(() => {
    const q = query().trim().toLowerCase();
    if (!q) return cards();
    return cards().filter((c) =>
      [c.fn, c.org, c.title, ...c.emails.map((e) => e.value), ...c.tels.map((x) => x.value)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  });

  const remove = async (card: Card) => {
    if (!confirm(t("addressbook.delete_contact_confirm") as string)) return;
    try {
      await deleteCard(props.book.id, card.uri);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (t("addressbook.delete_failed") as string));
    }
  };

  return (
    <SubPageContent
      title={props.book.displayname}
      description={t("addressbook.contact_count", { count: String(cards().length) }) as string}
      wide
      action={
        <PageActions actions={[
          { label: t("addressbook.new_contact"), icon: MdOutlineAdd, onClick: () => setCreating(true), primary: true },
        ]} />
      }
    >
      <Show when={cards().length > 0}>
        <label class="relative block">
          <MdOutlineSearch class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <Input
            class="w-full"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder={t("addressbook.search_placeholder") as string}
            aria-label={t("addressbook.search_placeholder") as string}
          />
        </label>
      </Show>

      <Show
        when={visible().length > 0}
        fallback={
          <p class="text-sm text-muted py-6">
            {data.loading
              ? ""
              : cards().length === 0
                ? t("addressbook.no_contacts")
                : t("addressbook.no_search_results")}
          </p>
        }
      >
        <ul class="grid gap-2 sm:grid-cols-2">
          <For each={visible()}>
            {(card) => (
              <CardRow
                card={card}
                onEdit={() => setEditing(card)}
                onDelete={() => remove(card)}
              />
            )}
          </For>
        </ul>
      </Show>

      <Show when={creating() || editing()}>
        <CardEditorModal
          bookId={props.book.id}
          card={editing() ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refetch(); }}
        />
      </Show>
    </SubPageContent>
  );
}

function CardRow(props: { card: Card; onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  const c = () => props.card;

  const subtitle = () => [c().title, c().org].filter(Boolean).join(" · ");
  const primary = () => c().emails[0]?.value ?? c().tels[0]?.value ?? "";

  return (
    <li class={`${cardClass()} flex items-center gap-3 p-3`}>
      <Show
        when={c().photo}
        fallback={
          <span class="w-11 h-11 rounded-full bg-overlay ring-1 ring-rim flex items-center justify-center shrink-0">
            <MdOutlinePerson class="w-5 h-5 text-muted" />
          </span>
        }
      >
        <Avatar src={c().photo} name={c().fn} size={11} class="ring-1 ring-rim" />
      </Show>

      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-txt truncate">{c().fn}</div>
        <Show when={subtitle()}>
          <div class="text-xs text-muted truncate">{subtitle()}</div>
        </Show>
        <Show when={primary()}>
          <div class="text-xs text-muted truncate">{primary()}</div>
        </Show>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <IconButton label={t("addressbook.edit_contact") as string} size="sm" onClick={props.onEdit}>
          <MdOutlineEdit class="w-4 h-4" />
        </IconButton>
        <IconButton
          label={t("addressbook.delete_contact") as string}
          variant="danger"
          size="sm"
          onClick={props.onDelete}
        >
          <MdOutlineDelete class="w-4 h-4" />
        </IconButton>
      </div>
    </li>
  );
}
