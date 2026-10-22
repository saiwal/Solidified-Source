// src/modules/rbmark/views/RbmarkView.tsx
// Same query parameters as core's Module\Rbmark:
//   ?url=&title=&ischat=1&private=1&remote_return=<url to go back to>
import { createSignal, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { useI18n } from "@utsukta/spa-core/i18n";
import { toast } from "@utsukta/spa-core/store/toast";
import { createBookmark } from "@/modules/bookmarks/api";
import { Button } from "@ui/Button";
import { Input } from "@ui/Field";
import { Card } from "@ui/Card";

/** Only http(s): these values arrive in a link anyone can craft. */
function httpUrl(v: string | string[] | undefined): string {
  const s = (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function RbmarkView() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const url = httpUrl(params.url);
  const back = httpUrl(params.remote_return);
  const ischat = one(params.ischat) === "1";
  const [title, setTitle] = createSignal(one(params.title).trim() || url);
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);

  async function save() {
    setSaving(true);
    try {
      await createBookmark({
        url,
        title: title().trim() || url,
        ischat,
        private: one(params.private) === "1",
      });
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (t("bookmarks.add_failed") as string));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="max-w-lg mx-auto p-4">
      <Card class="p-4 space-y-3">
        <h1 class="text-sm font-semibold text-txt">
          {ischat ? t("bookmarks.rbmark_chat_heading") : t("bookmarks.rbmark_heading")}
        </h1>

        <Show when={url} fallback={<p class="text-sm text-muted">{t("bookmarks.rbmark_bad_url")}</p>}>
          <Show
            when={!saved()}
            fallback={<p class="text-sm text-txt">{ischat ? t("bookmarks.rbmark_chat_saved") : t("bookmarks.added")}</p>}
          >
            <Input
              class="w-full"
              type="text"
              aria-label={t("bookmarks.field_title") as string}
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
            <p class="text-xs text-muted break-all">{url}</p>
            <Button size="sm" onClick={() => void save()} disabled={saving()}>
              {saving() ? t("bookmarks.saving") : t("bookmarks.save")}
            </Button>
          </Show>
        </Show>

        <Show when={back}>
          <a href={back} class="block text-xs text-accent hover:underline">
            {ischat ? t("bookmarks.rbmark_back_room") : t("bookmarks.rbmark_back")}
          </a>
        </Show>
      </Card>
    </div>
  );
}
