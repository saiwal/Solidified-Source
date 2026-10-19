// src/modules/channel/widgets/ChannelNewspaperWidget.tsx
import { For, Show } from "solid-js";
import { nick, channelCreated, posts, loading, loadingMore, streamHandlers } from "../store";
import { fetchChannelPosts, fetchProfile } from "../api";
import { fetchCategories } from "@/shared/stream/components/CategoryWidget";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import NewspaperView, {
  type CategoryGroup,
  Masthead,
  NewspaperPlaceholder,
  WireItemPlaceholder,
} from "@/shared/stream/feedviews/NewspaperView";
import ChannelFeedShell from "./ChannelFeedShell";

const POSTS_PER_SECTION = 4;

// Categories aren't attached to individual posts in the stream response
// (only exposed in aggregate via /spa/stream-widgets/categories), so the
// "few latest articles per category" panels need their own fetch per
// category rather than grouping the already-loaded page of posts.
async function fetchCategoryGroups([channelNick, picked]: [string, string[]]): Promise<CategoryGroup[]> {
  const categories = await fetchCategories({ channelNick, type: "posts" });
  // Picked slugs keep the user's order; a since-deleted category just drops out.
  const chosen = picked.flatMap((slug) => categories.filter((c) => c.slug === slug));
  const groups = await Promise.all(
    chosen.map(async (cat) => {
      const result = await fetchChannelPosts(channelNick, { cat: cat.slug });
      return {
        name: cat.name,
        slug: cat.slug,
        posts: result.items.filter((p) => p.item_thread_top === 1).slice(0, POSTS_PER_SECTION),
      };
    }),
  );
  return groups.filter((g) => g.posts.length > 0);
}

function NewspaperBody(props: { categories: string[] }) {
  const [categoryGroups] = createQueryResource(
    "channel-newspaper-sections",
    // No categories picked in the widget config = no sections, no fetch.
    () => (nick() && props.categories.length ? ([nick(), props.categories] as [string, string[]]) : null),
    fetchCategoryGroups,
  );

  return (
    <Show when={!loading()} fallback={<NewspaperPlaceholder />}>
      <NewspaperView
        posts={posts()}
        handlers={streamHandlers}
        categoryGroups={props.categories.length ? categoryGroups() : undefined}
      />
      <Show when={loadingMore()}>
        <div class="max-w-6xl mx-auto columns-1 sm:columns-2 gap-x-8 pt-6">
          <For each={Array(2).fill(0)}>{() => <WireItemPlaceholder />}</For>
        </div>
      </Show>
    </Show>
  );
}

export default function ChannelNewspaperWidget(props: { config?: Record<string, unknown> }) {
  const categories = () => (Array.isArray(props.config?.categories) ? props.config.categories.map(String) : []);
  // Masthead name + emblem; shares ContactCardWidget's cache.
  const [profile] = createQueryResource("contact-card", () => nick(), fetchProfile);
  // Page-width column for masthead, toolbar and paper alike.
  return (
    <div class="max-w-6xl mx-auto">
      <ChannelFeedShell
        header={
          <Masthead
            title={profile()?.channel_name}
            emblem={profile()?.channel_photo_l}
            founded={channelCreated()}
            address={profile()?.xchan_addr}
            tagline={profile()?.pdesc}
            pinned={posts().filter((p) => p.pinned)}
          />
        }
        body={() => <NewspaperBody categories={categories()} />}
      />
    </div>
  );
}
