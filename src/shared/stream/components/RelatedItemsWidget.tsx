// src/shared/stream/components/RelatedItemsWidget.tsx
//
// API: GET /spa/stream-widgets/related?item=<uuid|slug>&type=<posts|articles|cards>[&channel_nick=]
// Same row shape as /popular; ranking is server-side (shared hashtags/categories).
// Reads the item from the route and renders nothing off a single-item page
// or when nothing relates.

import { Show } from "solid-js";
import { useLocation } from "@solidjs/router";
import { apiError } from "@utsukta/spa-core/lib/fetch";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { useI18n } from "@utsukta/spa-core/i18n";
import PopularPostsWidget, { type PopularPost } from "./PopularPostsWidget";

export type Source = { type: "posts" | "articles" | "cards"; item: string; nick?: string };

// /display/:uuid, /item/:uuid, /articles/:nick/:x, /cards/:nick/:x — but not
// the literal series/deck index segments.
function sourceFromPath(path: string): Source | null {
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  if ((seg[0] === "display" || seg[0] === "item") && seg.length === 2) return { type: "posts", item: seg[1] };
  if (seg[0] === "articles" && seg.length === 3 && seg[2] !== "series") return { type: "articles", nick: seg[1], item: seg[2] };
  if (seg[0] === "cards" && seg.length === 3 && seg[2] !== "deck") return { type: "cards", nick: seg[1], item: seg[2] };
  return null;
}

export async function fetchRelated(src: Source & { limit?: number }): Promise<PopularPost[]> {
  const url = new URL("/spa/stream-widgets/related", window.location.origin);
  url.searchParams.set("type", src.type);
  url.searchParams.set("item", src.item);
  if (src.nick) url.searchParams.set("channel_nick", src.nick);
  if (src.limit) url.searchParams.set("limit", String(src.limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw await apiError(res);
  const json = await res.json();
  return (json.data ?? json).related ?? [];
}

export default function RelatedItemsWidget() {
  const { t } = useI18n();
  const location = useLocation();
  const [related] = createQueryResource("stream-related", () => sourceFromPath(location.pathname), fetchRelated);

  return (
    <Show when={related()?.length}>
      <PopularPostsWidget
        data={related()}
        title={t("widgets.related")}
        type={sourceFromPath(location.pathname)?.type}
        channelNick={sourceFromPath(location.pathname)?.nick}
      />
    </Show>
  );
}
