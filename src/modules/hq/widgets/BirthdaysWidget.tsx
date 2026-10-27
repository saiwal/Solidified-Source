/**
 * BirthdaysWidget.tsx
 * Connections with a birthday in the next 30 days (abook_dob — only set when
 * their profile shares a dob with you). Core makes calendar events for these
 * just 7–14 days out; this looks a month ahead. Hidden when there are none.
 */
import { For, Show } from "solid-js";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Card } from "@ui/Card";
import { Avatar } from "@ui/Avatar";
import { ListRow } from "@ui/ListRow";

interface Birthday { id: number; hash: string; name: string; photo: string; addr: string; date: string; days: number }

async function fetchBirthdays(): Promise<Birthday[]> {
  const res = await apiFetch("/spa/connections/birthdays");
  if (!res.ok) throw new Error(`birthdays ${res.status}`);
  return (await res.json()).data as Birthday[];
}

export default function BirthdaysWidget() {
  const { t, locale } = useI18n();
  const [list] = createQueryResource("birthdays", fetchBirthdays);

  // "05-14" → "14 May"; a fixed leap year so Feb 29 formats.
  const day = (md: string) =>
    new Date(`2024-${md}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "short" });
  const when = (days: number) =>
    days === 0 ? t("widgets.birthdays_today")
      : new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }).format(days, "day");

  return (
    <Show when={(list() ?? []).length > 0}>
      <Card class="p-4">
        <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
          {t("widgets.birthdays")}
        </h3>
        <For each={list()}>
          {(b) => (
            <ListRow
              href={`/chanview?f=&hash=${encodeURIComponent(b.hash)}`}
              leading={<Avatar src={b.photo} name={b.name} size={8} />}
              title={b.name}
              meta={`${day(b.date)} · ${when(b.days)}`}
              class={b.days === 0 ? "text-accent-txt" : undefined}
            />
          )}
        </For>
      </Card>
    </Show>
  );
}
