// mappers/activity.mapper.ts
import { sanitizeHtml } from "./sanitize";
import { bbcodeToHtml } from "./bbcode";
import { renderBody } from "./renderBody";
import { oembedResolver } from "./oembedResolver";
import { matchNsfwWord, wrapNsfwHtml } from "./nsfw";
import { nsfwWordsList } from "../store/nsfw-settings";
import type { Post, EventData, PollData } from "../types/post.types";

export function parseEventData(raw: string): EventData | undefined {
  const get = (tag: string) => {
    // [\s\S]*? (not [^\[]*?) — description can contain nested bbcode tags
    // (links, images, lists, …), which all start with '[' too.
    const m = raw.match(new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`));
    return m ? m[1].trim() : "";
  };
  const summary = get("event-summary");
  const start   = get("event-start");
  if (!summary || !start) return undefined;
  const rawDescription = get("event-description");
  const description = rawDescription ? sanitizeHtml(bbcodeToHtml(rawDescription)) : "";
  return { summary, start, finish: get("event-finish"), id: get("event-id"), description };
}

// Verbs that represent actual displayable content
// const DISPLAYABLE_VERBS = new Set(['Create', 'Like', 'Dislike', 'Announce']);

export function shouldDisplayActivity(activity: any): boolean {
  // Filter out internal "Add" bookkeeping entries — they have no body and just mirror another item
  if (activity.verb === "Add") return false;
  // Filter out items flagged as notshown
  if (activity.flags?.includes("notshown")) return false;
  return true;
}


export function mapActivityToPost(activity: any): Post {
  const rawBody: string = activity.body ?? "";

  let body = "";
  const nsfwMatch = matchNsfwWord(rawBody, nsfwWordsList());
  try {
    // Identity sanitizer: the nsfw reveal panel has to wrap the converted
    // markup *before* sanitizeHtml runs, since that is what whitelists the
    // data-nsfw-* attributes the panel needs.
    const converted = renderBody(rawBody, activity.mimetype, { oembedResolver }, (h) => h);
    let html = typeof converted === "string" ? converted : "";
    if (nsfwMatch) html = wrapNsfwHtml(html, nsfwMatch);
    body = sanitizeHtml(html);
  } catch (err) {
    console.error("Body parse failed", rawBody, err);
    body = "";
  }

  const eventData = activity.obj_type === "Event" ? parseEventData(rawBody) : undefined;

  const poll: PollData | undefined =
    activity.obj_type === "Question" && activity.poll
      ? {
          multiple:     activity.poll.multiple     ?? false,
          end_time:     activity.poll.end_time     ?? null,
          closed:       activity.poll.closed       ?? null,
          options:      Array.isArray(activity.poll.options) ? activity.poll.options : [],
          viewer_votes: Array.isArray(activity.poll.viewer_votes) ? activity.poll.viewer_votes : [],
        }
      : undefined;

  // summary: returned by Articles handler as 'summary', fallback to activity stream fields
  const rawSummary: string =
    activity.summary ?? activity.item_summary ?? activity.obj_summary ?? "";
  const summary = rawSummary.trim() || undefined;

  const rawTitle: string = activity.title ?? "";
  const nsfwTitleMatch = matchNsfwWord(rawTitle, nsfwWordsList());
  const title = nsfwTitleMatch ? wrapNsfwHtml(rawTitle, nsfwTitleMatch) : rawTitle;

  const rawLocation: string = activity.location ?? "";
  const location = rawLocation ? sanitizeHtml(bbcodeToHtml(rawLocation)) : undefined;

  return {
    id: activity.iid,
    iid: activity.iid ? Number(activity.iid) : undefined,
    uuid: activity.uuid,
    profileUid: activity.profile_uid ? Number(activity.profile_uid) : undefined,
    mid: activity.mid,
    parent_mid: activity.parent_mid,
    thr_parent: activity.thr_parent,
    top_mid: activity.message_top,
    parent: activity.uuid,
    body,
    rawBody,
    bodyNsfw: !!nsfwMatch,
    mimetype: activity.mimetype ?? "",
    summary,
    title,
    titleNsfw: !!nsfwTitleMatch,
    authorName: activity.author?.name ?? "",
    authorAvatar: activity.author?.photo?.src ?? "",
    authorUrl: activity.author?.url ?? "",
    authorHash: activity.author?.hash ?? "",
    authorAddress: activity.author?.address ?? "",
    authorNetwork: activity.author?.network ?? "",
    via: activity.owner ? {
      name: activity.owner.name ?? "",
      address: activity.owner.address ?? "",
      url: activity.owner.url ?? "",
      hash: activity.owner.hash ?? "",
      avatar: activity.owner.photo?.src ?? "",
    } : undefined,
    recipients: activity.recipients || undefined,
    created: activity.created,
    commented: activity.commented,
    edited: activity.edited,
    verb: activity.verb,
    obj_type: activity.obj_type,
    item_thread_top: activity.item_thread_top ?? 0,
    flags: activity.flags ?? [],
    canComment: activity.can_comment ?? true,
    permalink: activity.permalink ?? "",
    location,
    coord: activity.coord || undefined,
    expires: activity.expires || undefined,
    likeCount: activity.like_count ?? 0,
    viewerLiked: activity.viewer_liked ?? false,
    viewerDisliked: activity.viewer_disliked ?? false,
    viewerRepeated: activity.viewer_repeated ?? false,
    viewerStarred: (activity.flags ?? []).includes('starred'),
    pinned: (activity.flags ?? []).includes('pinned'),
    viewerFollowing: activity.viewer_following ?? false,
    viewerAttending: activity.viewer_attending ?? false,
    viewerDeclining: activity.viewer_declining ?? false,
    viewerMaybe: activity.viewer_maybe ?? false,
    attendCount: activity.attend_count ?? 0,
    declineCount: activity.decline_count ?? 0,
    maybeCount: activity.maybe_count ?? 0,
    item_origin: activity.item_origin ?? 0,
    dislikeCount: activity.dislike_count ?? 0,
    repeatCount: activity.announce_count ?? 0,
    commentCount: activity.comment_count ?? 0,
    blocked: activity.blocked ?? false,
    imported: activity.imported ?? false,
    slug: activity.slug ?? undefined,
    viewUrl: activity.view_url ?? undefined,
    publicPolicy: activity.public_policy ?? undefined,
    allowCid: activity.allow_cid ?? undefined,
    allowGid: activity.allow_gid ?? undefined,
    denyCid: activity.deny_cid ?? undefined,
    denyGid: activity.deny_gid ?? undefined,
    lang: activity.lang ?? undefined,
    series: activity.series ?? null,
    deck: activity.deck ?? null,
    template: activity.template ?? undefined,
    translationGroup: activity.translation_group ?? null,
    translations: Array.isArray(activity.translations)
      ? activity.translations.map((tr: any) => ({
          uuid: tr.uuid,
          lang: tr.lang,
          title: tr.title,
          viewUrl: tr.view_url,
        }))
      : undefined,
    eventData,
    poll,
    attachments: Array.isArray(activity.attach)
      ? activity.attach.map((a: any) => ({
          href: a.href ?? "",
          type: a.type ?? "application/octet-stream",
          title: a.title ?? (a.href ? decodeURIComponent(a.href.split("/").pop() ?? "") : ""),
          length: a.length != null ? String(a.length) : "0",
          revision: a.revision != null ? String(a.revision) : "0",
        }))
      : [],
    categories: activity.categories ?? [],
    tags: activity.tags ?? [],
    children: [],
  };
}
