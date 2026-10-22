import { createMemo, Show, Suspense } from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import SubPageLayout, { type SubPageItem } from "@/shared/views/SubPageLayout";
import { useI18n } from "@utsukta/spa-core/i18n";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { fetchAddressbooks, type Addressbook } from "../api";
import CardsSection from "./CardsSection";
import AddressbookSidebar from "./AddressbookSidebar";
import { Card } from "@ui/Card";
import { EmptyState } from "@ui/EmptyState";

const BASE = "/cdav/addressbook";

export default function AddressbookShellView() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const [books, { refetch }] = createQueryResource<Addressbook[]>(
    "addressbooks",
    fetchAddressbooks,
  );

  // The sections *are* the address books, so items is computed rather than a
  // static array — SubPageNav re-renders when this changes.
  const items = createMemo<SubPageItem[]>(() =>
    (books() ?? []).map((b) => ({ path: String(b.id), label: b.displayname })),
  );

  // Id is whatever sits after the base path — no useParams needed (same
  // approach as directory's ConnectionsShellView).
  const activeKey = createMemo<string>(() => {
    const seg = location.pathname.replace(/^\/cdav\/addressbook\/?/, "").split("/")[0] ?? "";
    const list = books() ?? [];
    if (seg && list.some((b) => String(b.id) === seg)) return seg;
    return list.length ? String(list[0].id) : "";
  });

  const activeBook = createMemo<Addressbook | undefined> (() =>
    (books() ?? []).find((b) => String(b.id) === activeKey()),
  );

  // Navigating to BASE lets activeKey fall back to the first remaining book.
  const afterChange = (goTo?: number) => {
    refetch();
    navigate(goTo === undefined ? BASE : `${BASE}/${goTo}`);
  };

  return (
    <SubPageLayout
      base={BASE}
      items={items()}
      activeKey={activeKey()}
      sidebarFooter={
        <AddressbookSidebar
          book={activeBook()}
          onCreated={(id) => afterChange(id)}
          onChanged={() => refetch()}
          onDeleted={() => afterChange()}
        />
      }
    >
      <Suspense fallback={<SectionSkeleton />}>
        <Show when={activeBook()} fallback={<EmptyState>{emptyMessage()}</EmptyState>}>
          {(book) => <CardsSection book={book()} />}
        </Show>
      </Suspense>
    </SubPageLayout>
  );

  function emptyMessage(): string {
    if (books.loading) return "";
    if (books.error) return t("addressbook.load_error") as string;
    return t("addressbook.no_addressbooks") as string;
  }
}


function SectionSkeleton() {
  return (
    <div class="px-4 md:px-6 py-6 space-y-4 animate-pulse">
      <div class="h-5 w-40 rounded bg-elevated" />
      <div class="h-px w-full bg-rim" />
      <div class="space-y-3">
        {[...Array(4)].map(() => (
          <Card class="p-3 flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-overlay shrink-0" />
            <div class="flex-1 space-y-2">
              <div class="h-3.5 bg-overlay rounded w-1/3" />
              <div class="h-3 bg-overlay rounded w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
