// src/modules/channel/views/ProfileView.tsx
import { createSignal, Show, For } from "solid-js";
import { A } from "@solidjs/router";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";
import { MdFillLocation_on, MdFillPublic, MdFillRss_feed, MdOutlineMail } from "solid-icons/md";
import { useAuth } from "@utsukta/spa-core/store/auth-store";
import { openComposer } from "@/shared/editor/store/composer-host";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { addConnection } from "@/modules/directory/people/api";
import { useI18n } from "@utsukta/spa-core/i18n";
import { sanitizeHtml } from "@utsukta/spa-core/lib/sanitize";
import { oembedResolver } from "@utsukta/spa-core/lib/oembedResolver";
import { openFeedModal } from "@utsukta/spa-core/store/feed-modal";
import { bbcodeDisplay } from "@utsukta/spa-core/lib/renderBody";

type ChannelProfile = {
  channel_name: string;
  channel_address: string;
  xchan_addr: string;
  channel_photo_l: string;
  channel_cover: string;
  pdesc: string;
  about: string;
  location: string;
  homepage: string;
  hometown: string;
  keywords: string[];
  gender: string;
  marital: string;
  sexual: string;
  politic: string;
  religion: string;
  dob: string;
  music: string;
  book: string;
  tv: string;
  film: string;
  interest: string;
  romance: string;
  work: string;
  education: string;
  likes: string;
  dislikes: string;
  contact: string;
  channels: string;
  connections: number;
  is_connected: boolean;
  /** Connected, but the other channel hasn't approved the request yet. */
  is_pending?: boolean;
  connect_url: string;
  channel_hash?: string;
  feed_url?: string;
  is_remote?: boolean;
  actor_fields?: { name: string; value: string }[];
  // Admin-defined profile fields (profdef/profext) on local channels
  custom_fields?: { name: string; label: string; type: string; value: string }[];
};

async function fetchProfile(nick: string): Promise<ChannelProfile | null> {
  if (!nick) return null;
  const res = await apiFetch(`/spa/profile/${nick}`);
  if (!res.ok) return null;
  const { data } = await res.json();
  if (!data) return null;
  return data as ChannelProfile;
}

// Profile fields (about, interest, likes, dislikes, contact, channels, music,
// book, tv, film, romance, work, education) are stored as raw BBCode source
// on local channels, mirroring core's advanced_profile()/prepare_text() —
// convert then sanitize before injecting as HTML.
function renderBbcode(raw?: string): string {
  if (!raw) return "";
  try {
    return sanitizeHtml(bbcodeDisplay(raw, { oembedResolver }));
  } catch {
    return "";
  }
}

export default function ProfileView(props: { full?: boolean }) {
  const nick = usePageNick();
  const viewerRole = useViewerRole();
  const [profile] = createQueryResource("channel-profile", () => nick(), fetchProfile);

  const isOwner = () => viewerRole() === "owner";
  const isVisitor = () => viewerRole() === "remote" || viewerRole() === "anonymous";
  const p = () => profile();

  return (
    <div class="mb-6">
      <Show when={profile.loading}>
        <ProfileSkeleton />
      </Show>
      <Show when={p() !== undefined && p() !== null}>
        <Show
          when={props.full}
          fallback={
            <CompactCard p={p()!} isOwner={isOwner()} isVisitor={isVisitor()} />
          }
        >
          <FullCard p={p()!} isOwner={isOwner()} isVisitor={isVisitor()} />
        </Show>
      </Show>
    </div>
  );
}

// ─── Copy-to-clipboard address badge ────────────────────────────────────────

function AddressRow(props: { address: string }) {
  const [copied, setCopied] = createSignal(false);

  function copy() {
    navigator.clipboard.writeText(props.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <span class="inline-flex items-center gap-1 text-sm text-muted">
      <span>@{props.address}</span>
      <button
        onClick={copy}
        title="Copy address"
        class="p-0.5 rounded hover:bg-overlay transition-colors text-muted hover:text-txt"
        aria-label="Copy address to clipboard"
      >
        <Show
          when={copied()}
          fallback={
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-accent">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </Show>
      </button>
    </span>
  );
}

// ─── Shared header (cover + avatar + name + connect) ────────────────────────

function ProfileHeader(props: {
  p: ChannelProfile;
  isOwner: boolean;
  isVisitor: boolean;
}) {
  const { p } = props;
  const { t } = useI18n();

  return (
    <>
      {/* Cover */}
      <div class="relative bg-gradient-to-br from-accent to-accent-txt" style="aspect-ratio: 3 / 1;">
        <Show when={p.channel_cover}>
          <img src={p.channel_cover} alt="" class="absolute inset-0 w-full h-full object-cover" />
        </Show>
        <div class="absolute -bottom-10 left-5">
          <img
            src={p.channel_photo_l}
            alt={p.channel_name}
            class="w-20 h-20 rounded-full ring-4 ring-surface object-cover bg-overlay"
          />
        </div>
        <Show when={props.isOwner}>
          <a
            href="/settings/profile"
            class="absolute top-3 right-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm transition-colors"
          >
            {t("channel.edit_profile")}
          </a>
        </Show>
      </div>

      {/* Name row */}
      <div class="pt-12 px-5 flex items-start justify-between gap-3">
        <div>
          <h1 class="text-lg font-bold leading-tight text-txt">{p.channel_name}</h1>
          <AddressRow address={p.xchan_addr || p.channel_address} />
          <Show when={p.pdesc}>
            <p class="text-xs text-muted mt-0.5 italic">{p.pdesc}</p>
          </Show>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          {/* Local channels: open the filterable subscribe modal. Remote
              actors have no local /spa/feed to filter — link straight to
              their home hub's own feed instead, same as before. */}
          <Show when={p.feed_url}>
            <Show
              when={!p.is_remote}
              fallback={
                <a
                  href={p.feed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("channel.rss_feed")}
                  class="p-1.5 rounded-full border border-rim text-muted hover:text-accent hover:border-accent transition-colors"
                >
                  <MdFillRss_feed size={16} />
                </a>
              }
            >
              <button
                onClick={() => openFeedModal(p.channel_address)}
                title={t("channel.rss_feed")}
                aria-label={t("channel.rss_feed")}
                class="p-1.5 rounded-full border border-rim text-muted hover:text-accent hover:border-accent transition-colors"
              >
                <MdFillRss_feed size={16} />
              </button>
            </Show>
          </Show>
          <Show when={!props.isOwner}>
            <FollowButton p={p} isVisitor={props.isVisitor} />
          </Show>
        </div>
      </div>
    </>
  );
}

// ─── Compact card (shown on /channel/:nick) ──────────────────────────────────

function CompactCard(props: { p: ChannelProfile; isOwner: boolean; isVisitor: boolean }) {
  const { p } = props;
  const { t } = useI18n();

  return (
    <div class="rounded-2xl overflow-hidden bg-surface border border-rim shadow-sm">
      <ProfileHeader p={p} isOwner={props.isOwner} isVisitor={props.isVisitor} />

      <div class="px-5 pb-5">
        {/* Remote badge */}
        <Show when={p.is_remote}>
          <div class="mt-3">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-overlay text-muted border border-rim">
              <MdFillPublic size={11} /> {t("channel.remote_channel")}
            </span>
          </div>
        </Show>

        {/* Bio (remote actor summary or local about) */}
        <Show when={p.is_remote && p.about}>
          <p class="mt-3 text-xs text-txt leading-relaxed line-clamp-3">{p.about}</p>
        </Show>

        {/* Location + gender (local only) */}
        <Show when={!p.is_remote && (p.location || p.gender)}>
          <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Show when={p.location}>
              <span class="flex items-center gap-1">
                <MdFillLocation_on size={14} /> {p.location}
              </span>
            </Show>
            <Show when={p.gender}>
              <span>{p.gender}</span>
            </Show>
          </div>
        </Show>

        {/* Keywords */}
        <Show when={p.keywords.length > 0}>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <For each={p.keywords}>
              {(tag) => (
                <span class="px-2 py-0.5 text-xs rounded-full bg-overlay text-muted">#{tag}</span>
              )}
            </For>
          </div>
        </Show>

        {/* AP actor fields (remote) / admin-defined fields (local) */}
        <Show when={(p.is_remote && (p.actor_fields?.length ?? 0) > 0) || p.custom_fields?.some(customFieldShown)}>
          <div class="mt-3 space-y-1">
            <For each={p.is_remote ? p.actor_fields : []}>
              {(f) => (
                <div class="flex gap-2 text-xs">
                  <span class="text-muted w-20 shrink-0">{f.name}</span>
                  <span class="text-txt">{f.value}</span>
                </div>
              )}
            </For>
            <For each={p.custom_fields?.filter(customFieldShown)}>
              {(f) => (
                <div class="flex gap-2 text-xs">
                  <span class="text-muted w-20 shrink-0">{f.label}</span>
                  <Show
                    when={f.type === "tags"}
                    fallback={<span class="text-txt">{f.type === "checkbox" ? "\u2713" : f.value}</span>}
                  >
                    <div class="flex flex-wrap gap-1.5">
                      <For each={splitTags(f.value)}>
                        {(tag) => (
                          <span class="px-2 py-0.5 rounded-full bg-overlay text-muted">{tag}</span>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Contact info */}
        <Show when={p.homepage || p.contact}>
          <div class="mt-3 space-y-1">
            <Show when={p.homepage}>
              <a
                href={p.homepage}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
              >
                <MdFillPublic size={13} />
                {p.homepage.replace(/^https?:\/\//, "")}
              </a>
            </Show>
            <Show when={p.contact}>
              <p
                class="text-xs text-muted [&_a]:text-accent [&_a]:no-underline [&_a]:hover:underline"
                innerHTML={renderBbcode(p.contact)}
              />
            </Show>
          </div>
        </Show>

        {/* View full profile (local only) */}
        <Show when={!p.is_remote}>
          <div class="mt-3 flex justify-end">
            <A
              href={`/profile/${p.channel_address}`}
              class="text-xs text-muted hover:text-accent transition-colors"
            >
              {t("channel.more_details")} →
            </A>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ─── Full card (shown on /profile/:nick) ─────────────────────────────────────

function FullCard(props: { p: ChannelProfile; isOwner: boolean; isVisitor: boolean }) {
  const { p } = props;
  const { t, locale } = useI18n();

  return (
    <div class="rounded-2xl overflow-hidden bg-surface border border-rim shadow-sm">
      <ProfileHeader p={p} isOwner={props.isOwner} isVisitor={props.isVisitor} />

      <div class="px-5 pb-6 space-y-5 mt-4">
        {/* About — local channels store raw BBCode source; remote AP actor
            summaries arrive pre-stripped of tags (see FetchesRemoteActor.php),
            so they're rendered as plain text rather than re-parsed as BBCode. */}
        <Show when={p.about}>
          <Show
            when={!p.is_remote}
            fallback={<p class="text-sm text-txt leading-relaxed whitespace-pre-line">{p.about}</p>}
          >
            <div
              class="text-sm text-txt leading-relaxed prose prose-sm dark:prose-invert max-w-none
                     prose-a:text-accent prose-a:no-underline prose-a:hover:underline"
              innerHTML={renderBbcode(p.about)}
            />
          </Show>
        </Show>

        {/* Meta bar */}
        <div class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          <Show when={p.location}>
            <span class="flex items-center gap-1">
              <MdFillLocation_on size={14} /> {p.location}
            </span>
          </Show>
          <Show when={p.homepage}>
            <a
              href={p.homepage}
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1 hover:text-accent transition-colors"
            >
              <MdFillPublic size={13} /> {p.homepage.replace(/^https?:\/\//, "")}
            </a>
          </Show>
        </div>

        {/* Keywords */}
        <Show when={p.keywords.length > 0}>
          <div class="flex flex-wrap gap-1.5">
            <For each={p.keywords}>
              {(tag) => (
                <span class="px-2 py-0.5 text-xs rounded-full bg-overlay text-muted">#{tag}</span>
              )}
            </For>
          </div>
        </Show>

        {/* Field sections */}
        <Show when={
          p.gender || p.marital || p.sexual || (p.dob && p.dob !== "0000-00-00") || p.hometown ||
          p.politic || p.religion || p.interest || p.romance || p.likes || p.dislikes ||
          p.music || p.book || p.tv || p.film || p.work || p.education || p.contact || p.channels
        }>
          <div class="border-t border-rim pt-5 space-y-5">
            <Show when={p.gender || p.marital || p.sexual || (p.dob && p.dob !== "0000-00-00") || p.hometown}>
              <FieldSection label={t("channel.group_personal")}>
                <Field label={t("channel.field_gender")}       value={p.gender} />
                <Field label={t("channel.field_born")}         value={formatDob(p.dob, locale())} />
                <Field label={t("channel.field_hometown")}     value={p.hometown} />
                <Field label={t("channel.field_relationship")} value={p.marital} />
                <Field label={t("channel.field_sexual")}       value={p.sexual} />
              </FieldSection>
            </Show>

            <Show when={p.politic || p.religion}>
              <FieldSection label={t("channel.group_beliefs")}>
                <Field label={t("channel.field_politics")}  value={p.politic} />
                <Field label={t("channel.field_religion")}  value={p.religion} />
              </FieldSection>
            </Show>

            <Show when={p.interest || p.romance || p.likes || p.dislikes}>
              <FieldSection label={t("channel.group_interests")}>
                <Field label={t("channel.field_hobbies")}   value={p.interest} bbcode />
                <Field label={t("channel.field_romance")}   value={p.romance} bbcode />
                <Field label={t("channel.field_likes")}     value={p.likes} bbcode />
                <Field label={t("channel.field_dislikes")}  value={p.dislikes} bbcode />
              </FieldSection>
            </Show>

            <Show when={p.music || p.book || p.tv || p.film}>
              <FieldSection label={t("channel.group_culture")}>
                <Field label={t("channel.field_music")}      value={p.music} bbcode />
                <Field label={t("channel.field_books")}      value={p.book} bbcode />
                <Field label={t("channel.field_television")} value={p.tv} bbcode />
                <Field label={t("channel.field_film")}       value={p.film} bbcode />
              </FieldSection>
            </Show>

            <Show when={p.work || p.education}>
              <FieldSection label={t("channel.group_work")}>
                <Field label={t("channel.field_work")}      value={p.work} bbcode />
                <Field label={t("channel.field_education")} value={p.education} bbcode />
              </FieldSection>
            </Show>

            <Show when={p.contact || p.channels}>
              <FieldSection label={t("channel.group_contact")}>
                <Field label={t("channel.field_contact")}        value={p.contact} bbcode />
                <Field label={t("channel.field_other_channels")} value={p.channels} bbcode />
              </FieldSection>
            </Show>
          </div>
        </Show>

        {/* AP actor fields (remote channels) / admin-defined fields (local) */}
        <Show when={(p.is_remote && (p.actor_fields?.length ?? 0) > 0) || p.custom_fields?.some(customFieldShown)}>
          <div class="border-t border-rim pt-5">
            <FieldSection label={t("channel.group_profile_fields")}>
              <For each={p.is_remote ? p.actor_fields : []}>
                {(f) => <Field label={f.name} value={f.value} />}
              </For>
              {/* core renders extra fields through prepare_text(), i.e. BBCode */}
              <For each={p.custom_fields?.filter(customFieldShown)}>
                {(f) => (
                  <Field
                    label={f.label}
                    value={f.type === "checkbox" ? "\u2713" : f.value}
                    bbcode={f.type !== "tags" && f.type !== "checkbox"}
                    tags={f.type === "tags"}
                  />
                )}
              </For>
            </FieldSection>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// dob's year is "0000" when the profile owner chose not to disclose their
// year of birth (Hubzilla's "no year" birthday convention) — show month/day only.
function formatDob(dob: string, locale: string): string {
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const [, year, month, day] = match;
  if (month === "00" || day === "00") return "";
  const yearKnown = year !== "0000";
  const date = new Date(Date.UTC(yearKnown ? Number(year) : 2000, Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    year: yearKnown ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}

function FieldSection(props: { label: string; children: any }) {
  return (
    <div>
      <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2.5">
        {props.label}
      </p>
      <div class="grid grid-cols-1 gap-2">
        {props.children}
      </div>
    </div>
  );
}

// An unchecked checkbox stores "0" — a truthy JS string, so it needs its own
// emptiness rule or every unchecked box renders a literal 0.
function customFieldShown(f: { type: string; value: string }): boolean {
  return f.type === "checkbox" ? f.value === "1" : Boolean(f.value);
}

// A "tags" custom field stores a plain comma-separated string (profext has no
// list type); it renders as chips, like the profile's own keywords.
function splitTags(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function Field(props: { label: string; value: string; bbcode?: boolean; tags?: boolean }) {
  return (
    <Show when={props.value}>
      <div class="flex gap-3">
        <span class="text-xs font-medium text-muted w-28 shrink-0 pt-px">{props.label}</span>
        <Show
          when={props.tags}
          fallback={
            <Show
              when={props.bbcode}
              fallback={<span class="text-xs text-txt leading-relaxed">{props.value}</span>}
            >
              <div
                class="text-xs text-txt leading-relaxed prose prose-sm dark:prose-invert max-w-none prose-p:my-0
                       prose-a:text-accent prose-a:no-underline prose-a:hover:underline"
                innerHTML={renderBbcode(props.value)}
              />
            </Show>
          }
        >
          <div class="flex flex-wrap gap-1.5">
            <For each={splitTags(props.value)}>
              {(tag) => (
                <span class="px-2 py-0.5 text-xs rounded-full bg-overlay text-muted">{tag}</span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

function FollowButton(props: { p: ChannelProfile; isVisitor: boolean }) {
  const { t } = useI18n();
  const auth = useAuth();
  const [state, setState] = createSignal<"idle" | "pending" | "done">("idle");
  // Handed to ComposerHost so a half-written DM survives navigation. The scope
  // carries the recipient, so DMs to two different people are two composers
  // with two drafts rather than one that overwrites the other.
  const openDm = (r: {
    xid: string; name: string; nick: string; photo?: string;
  }) =>
    openComposer({
      kind: "dm",
      scope: `dm:new:${r.xid}`,
      title: t("editor.dm_new_message"),
      props: {
        profileUid: auth()!.uid,
        scopeKey: `dm:new:${r.xid}`,
        initialRecipients: [{
          type: "c",
          xid: r.xid,
          id: r.xid,
          name: r.name,
          nick: r.nick,
          link: r.nick,
          photo: r.photo,
        }],
      },
    });

  const nick = () => props.p.xchan_addr || props.p.channel_address;
  const connected = () => props.p.is_connected || state() === "done";
  // A just-sent request is pending too, until the other side approves it.
  const pending = () => props.p.is_pending || state() === "done";

  async function handleConnect() {
    if (state() !== "idle") return;
    setState("pending");
    try {
      await addConnection(nick());
      setState("done");
    } catch {
      setState("idle");
    }
  }

  const base = "shrink-0 px-4 py-1.5 text-sm font-medium rounded-full border transition-colors";
  const connectedCls = "border-rim text-muted cursor-default";
  // Same treatment the connections list gives its "Pending" badge.
  const pendingCls = "border-transparent bg-accent-muted text-accent cursor-default";
  const connectCls = "border-accent bg-accent text-accent-fg hover:opacity-80";

  return (
    <Show
      when={!connected()}
      fallback={
        <div class="flex items-center gap-2">
          <span class={`${base} ${pending() ? pendingCls : connectedCls}`}>
            {pending() ? t("connection.pending") : t("channel.connected")}
          </span>
          {/* No DM while the request is unapproved — post_mail isn't granted
              until they accept, so the send would be dropped on their hub. */}
          <Show when={props.p.is_connected && !pending() && !props.isVisitor && props.p.channel_hash && auth()?.uid}>
            <button
              onClick={() =>
                openDm({
                  xid: props.p.channel_hash!,
                  name: props.p.channel_name,
                  nick: nick(),
                  photo: props.p.channel_photo_l,
                })
              }
              title={t("ui.send_dm")}
              aria-label={t("ui.send_dm")}
              class="shrink-0 p-2 rounded-full border border-rim text-muted hover:text-accent hover:border-accent transition-colors"
            >
              <MdOutlineMail size={16} />
            </button>
          </Show>
        </div>
      }
    >
      <Show
        when={!props.isVisitor}
        // Remote visitors follow from their own hub (core rconnect_url);
        // no button for anonymous viewers, matching core's profile sidebar.
        fallback={
          <Show when={props.p.connect_url}>
            <a href={props.p.connect_url} class={`${base} ${connectCls}`}>
              {t("channel.connect")}
            </a>
          </Show>
        }
      >
        <button
          onClick={handleConnect}
          disabled={state() === "pending"}
          class={`${base} ${connectCls} disabled:opacity-60`}
        >
          {t("channel.connect")}
        </button>
      </Show>
    </Show>
  );
}

function ProfileSkeleton() {
  return (
    <div class="rounded-2xl overflow-hidden bg-surface border border-rim shadow-sm animate-pulse">
      <div class="h-36 bg-overlay" />
      <div class="pt-12 px-5 pb-5">
        <div class="flex items-start justify-between">
          <div class="space-y-2">
            <div class="h-5 w-36 bg-overlay rounded" />
            <div class="h-3.5 w-24 bg-overlay rounded" />
          </div>
          <div class="h-8 w-24 bg-overlay rounded-full" />
        </div>
        <div class="mt-3 space-y-2">
          <div class="h-3 bg-overlay rounded w-full" />
          <div class="h-3 bg-overlay rounded w-4/5" />
        </div>
      </div>
    </div>
  );
}
