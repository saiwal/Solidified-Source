// src/modules/moderate/store.ts
//
// Which of the viewer's own posts/comments actually have a pending
// Like/Dislike/Announce waiting for approval. Pending reactions never render
// as thread rows, so without this the flag icon in PostCard's toolbar would
// show on every owned row and almost always open an empty panel.
//
// One channel-wide GET /spa/moderate, lazily armed: nothing is fetched until
// a PostCard that could show the flag mounts (visitors, and the feeds that
// don't wire the moderation handlers, never trigger it).

import { createSignal } from "solid-js";
import { createResource } from "@utsukta/spa-core/lib/resource";
import { fetchModerationQueue, type PendingItem } from "./api";

const REACTION_VERBS = new Set(["Like", "Dislike", "Announce"]);

const [armed, setArmed] = createSignal(false);
const [queue, { refetch }] = createResource(armed, fetchModerationQueue, {
  initialValue: [] as PendingItem[],
});

export function ensurePendingModeration(): void {
  setArmed(true);
}

export function refreshPendingModeration(): void {
  if (armed()) refetch();
}

// thr_parent of a reaction is the mid of the post *or* comment it reacts to.
export function pendingReactionMids(): Set<string> {
  return new Set(
    (queue() ?? [])
      .filter((i) => REACTION_VERBS.has(i.verb) && i.thr_parent)
      .map((i) => i.thr_parent),
  );
}
