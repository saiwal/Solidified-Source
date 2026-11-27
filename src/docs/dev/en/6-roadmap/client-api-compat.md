# Third-party client compatibility

**Status: planned, not started.**

Goal: a person with a channel on a hub running this theme can sign in from an off-the-shelf
fediverse client and use it as their main client. That covers both generic ActivityPub API
clients and apps written for Mastodon (Tusky, Ice Cubes, Elk, Phanpy, Ivory…). All of this
work goes in **this theme's API layer** (`packages/spa-core/php/Api/`). It reuses the handlers,
item formatting and permission checks that `/spa/*` already has. Core and its classic
`/api/z/1.0/` are not touched.

## Two specs, not one

"ActivityPub client-to-server" and "works with Mastodon apps" are different targets:

| | ActivityPub C2S | Mastodon client API |
|---|---|---|
| Spec | [W3C ActivityPub §6 *Client to Server Interactions*](https://www.w3.org/TR/activitypub/#client-to-server-interactions) + SWICG's draft [Basic Profile for ActivityPub API Servers](https://swicg.github.io/activitypub-api/basicprofile) ([announcement, May 2026](https://www.w3.org/community/socialcg/2026/05/19/initial-draft-of-basic-profile-for-activitypub-api-servers/)) | [docs.joinmastodon.org/methods](https://docs.joinmastodon.org/methods/) (de facto; Pleroma/Akkoma, GoToSocial, Misskey forks and Friendica implement it) |
| Wire format | ActivityStreams JSON-LD: POST activities to the outbox, GET inbox/outbox collections | REST + Mastodon JSON entities (`Status`, `Account`, `Notification`…) |
| Paths | discovered from the actor document (`outbox`, `endpoints.*`), so they can live anywhere | **hard-coded** by clients: `/api/v1/…`, `/api/v2/…`, `/oauth/authorize`, `/oauth/token`, `/.well-known/nodeinfo` |
| Clients | few, mostly experimental | essentially every fediverse mobile and desktop app |

**Mastodon clients do not speak ActivityPub C2S.** The stated outcome ("a client developed for
Mastodon") needs the Mastodon API (Phase 2). Phase 1 (AP C2S) is smaller, standards-based and
cleaner for Hubzilla's ACL model, but on its own it unlocks almost no existing apps. Both phases
share Phase 0.

## What exists today

- `/spa/*` authenticates by **session cookie + `X-CSRF-Token` only** (`Auth.php`). There are no
  bearer tokens. This is the TUI's gap G1 (`hz-rust-tui/docs/SERVER-GAPS.md`), so the auth work
  here closes that gap too.
- `Router.php` maps `/spa/<resource>` → `Handlers\<Resource>`. One theme owns the `spa` route and
  the hooks (`SpaTheme.php` `set()` → `Route::register` / `register_hook`), so new routes and hooks
  are registered there.
- spa-core already hooks `encode_person` (`hooks/chatids.php`) to add fields to the channel's AP
  actor, so it can also advertise C2S endpoints there.
- Core provides an OAuth2 server (bshaffer, `Zotlabs/Identity/OAuth2Server.php`, `/authorize`,
  `/token`, `/.well-known/oauth-authorization-server`). It supports `authorization_code` and
  `client_credentials` grants only: no refresh tokens, no PKCE, and a non-standard
  auto-registration inside `Authorize::post()`. spa-core can reuse its storage tables
  (`oauth_clients`, `oauth_access_tokens`) and its `verifyResourceRequest()`, but the grants and
  endpoints clients need have to be served by spa-core.
- Core's AP outbox (`Zotlabs/Module/Outbox.php`) is **GET-only** (server-to-server reads). The
  actor's `inbox` (pubcrawl) accepts only signed server-to-server POSTs.
- Read side: `FormatsItems::formatItem()` is the one item shape. `Network`, `Channel`,
  `Pubstream`, `Display`, `Notifications`, `Item` (comments, reactions, edit, delete, reshare),
  `Photos`/`Files` (uploads), `Connections`/`Directory` and `PrivacyGroups` cover nearly
  every read and write either API needs. The new endpoints are **adapters over these
  handlers**. They must not query the database themselves: core parity (`3-data/core-parity.md`)
  depends on every post going through the same path.

## Phase 0 — shared foundation

- [ ] **Bearer auth on `/spa/*`** (= G1). In `Auth::require*()`, when there is no session and an
  `Authorization: Bearer` header is present, verify it with core's `OAuth2Server::verifyResourceRequest()`,
  set the channel for this request only (no session write, unlike core's `api_login()`), and
  **skip CSRF** for bearer requests (a bearer header is not ambient).
  Add one `Auth::bearerChannel()` used by every guard. Do not add per-handler checks.
- [ ] **Scopes** checked in the same guards. Map both scope vocabularies onto one internal set
  (`read`, `write`, `follow`, `push`, `files`, `profile`):
  Mastodon's `read`/`write`/`follow`/`push` (+ `read:statuses` granular forms) and the SWICG
  URI scopes (`…/scopes#readinbox`, `#createcontent`, `#uploadfiles`, `#follow`, `#like`…).
  Every handler method declares which scope it needs (a constant on the handler, read by `Router`).
- [ ] **OAuth endpoints in spa-core** (`Handlers/Oauth.php`): authorization-code grant with
  **PKCE S256** and **refresh tokens** (`OAuth2\GrantType\RefreshToken`). The consent screen is an
  SPA route (`/oauth/consent`) that posts back to the handler. It must also cover choosing which
  channel the token is for, because an account can have several channels and a token is bound
  to one, as in core's `Authorize`.
- [ ] **Client registration**, three ways, one storage (`oauth_clients`):
  - Mastodon `POST /api/v1/apps` (RFC 7591-shaped; returns `client_id`/`client_secret`).
  - Client ID Metadata Documents (the Basic Profile's SHOULD; `client_id` is an https URL the
    server fetches). Fetch with `ValidatesRemoteHost` (SSRF guard), cache, and never trust
    `redirect_uris` that aren't in the fetched document.
  - FEP-d8c2 (`client_id` = the AP `Application` object's id): the same fetch path.
- [ ] **RFC 8414 metadata** at `/.well-known/oauth-authorization-server`. Core already answers this
  path (`Well_known.php` → `Oauthinfo`), so either take it over from the theme or advertise
  spa-core's endpoints in the actor instead (`endpoints.oauthAuthorizationEndpoint` /
  `oauthTokenEndpoint` / `oauthRegistrationEndpoint`) and leave core's alone. **Decision needed.**
  Include `code_challenge_methods_supported: ["S256"]`, `scopes_supported`,
  `client_id_metadata_document_supported`. The token response carries `activitypub_actor_id`.
- [ ] **Token management UI**: Settings → Integrations gets a "Connected apps" list with revoke
  (delete from `oauth_access_tokens`/`oauth_refresh_tokens` for this channel).
- [ ] **CORS** on the new endpoints (`Access-Control-Allow-Origin: *`, preflight), so browser
  clients (Elk, Phanpy) work. This is safe only because these requests carry a bearer token and
  never rely on cookies. Keep `/spa/*` cookie requests same-origin.
- [ ] **Rate limits**: return 429 with `Retry-After` (a MUST in the Basic Profile). A per-token
  counter in `Zotlabs\Lib\Cache` is enough.
- [ ] Errors: `Response::error` keeps `/spa`'s envelope. The new surfaces need their own
  error shapes (Mastodon `{error}`, RFC 9457 problem details for AP), so give each adapter its
  own small `Response` variant.

## Phase 1 — ActivityPub C2S

Routes under `/spa/ap/…` (new `Handlers/Ap.php`), advertised through the `encode_person` hook.
Clients discover endpoints from the actor document, so the URLs don't need to be the
spec's examples.

- [ ] **Actor additions** (`encode_person`, alongside `chatids`): `endpoints.uploadMedia`,
  `endpoints.proxyUrl`, OAuth endpoints (see Phase 0). Leave the actor's `outbox`/`inbox` alone,
  because remote servers read them. Advertise the owner-facing C2S URLs **only** in `endpoints`,
  under a documented extension name (Basic Profile issue tracker:
  https://github.com/swicg/activitypub-api/issues). The outbox has no endpoint key in the spec,
  so look for an existing convention before inventing one. **Decision needed.**
- [ ] **`POST` outbox** (bearer, `createcontent` etc.): parse an AS2 activity and dispatch to the
  existing write paths:
  | Activity | Calls |
  |---|---|
  | `Create` Note/Article (bare objects get wrapped in `Create`, per §6.2.1) | `Item` post/comment path (comment when `inReplyTo` resolves to a local item) |
  | `Update` | `Item` edit; `Update` on own actor → `Profile` |
  | `Delete` | `Item` delete (federated) |
  | `Like` / `Undo Like` | `Item` like toggle |
  | `Announce` / `Undo` | `Item` repeat / reshare |
  | `Follow` / `Undo Follow` | connection add/remove (`Connections` handler) |
  | `Block` | superblock path (`blockedEntries()`), gated on the superblock app as today |
  | `Add` / `Remove` | (later) privacy groups or collections |
  Reply `201 Created` + `Location: <activity id>`. Return 400 for activities that can't be
  mapped. Do not store an activity that has no side effect.
- [ ] **Addressing → ACL**: map `to`/`cc`/`bto`/`bcc` onto Hubzilla ACLs via `ResolvesAcl`:
  `as:Public` → public; the actor's followers collection → `public_policy = 'contacts'`;
  actor ids → `allow_cid` (resolve to xchan, refuse unknown actors); a privacy group's
  collection URL → `allow_gid`. Anything that would widen the audience beyond what the client
  asked for is a 400, never a silent fallback.
- [ ] **GET inbox / outbox for the owner** (bearer `readinbox`/`readoutbox`): `OrderedCollection`
  paging over `Network` (inbox) and `Channel` (outbox). This needs an **AS2 encoder**: reuse core's
  `Activity::encode_item()` (what federation already sends), not `formatItem()`.
- [ ] **`uploadMedia`**: multipart `file` + `object` → `Files`/`Photos` upload, returns `201` with
  `Location` of the `Create`.
- [ ] **`proxyUrl`**: fetch a remote object signed as the user (`Activity::fetch()` with the
  channel's key) through `ValidatesRemoteHost`.
- [ ] Tests: `Handlers/Ap.test.php` covering each activity row above + the ACL mapping (the
  ACL mapping is the security-critical part).

## Phase 2 — Mastodon client API

The paths are fixed by clients and live outside `/spa`. `/api/*` belongs to core's `Api` module,
and core's `Api_router::find()` only matches an `[id]` as the **last** path segment
(`/api/v1/statuses/:id/favourite` can't be registered through its `api_register` hook).
**Decision needed**, options:
1. spa-core registers its own module for `api` (via `SpaTheme::set()`). It serves `api/v1/*`,
   `api/v2/*` and `api/oembed`, and hands every other path to core's `Api` controller unchanged, so
   `/api/z/1.0` and the `twitter_api` addon keep working. A regression test must cover that
   hand-off.
2. Upstream a pattern-matching `Api_router` and register through `api_register`. This is cleaner,
   but it depends on a core release.

`/oauth/authorize` and `/oauth/token` collide with core's `Oauth` module (the OAuth1 apps
manager) the same way. Clients read `/.well-known/oauth-authorization-server` only on Mastodon
≥4.3; most still hard-code `/oauth/*`.

Endpoints in the order clients need them (a client is unusable until the first group works):

- [ ] **Boot**: `GET /api/v1/instance` and `/api/v2/instance` (from `Siteinfo`), `/.well-known/nodeinfo`
  (core already serves it; check that `software.name` doesn't make clients assume features),
  `POST /api/v1/apps`, `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`,
  `GET /api/v1/accounts/verify_credentials`, `GET /api/v1/preferences`, `GET /api/v1/custom_emojis` (`[]`).
- [ ] **Read**: `timelines/home` (`Network`), `timelines/public` (`Pubstream`, `local=true` → this hub),
  `timelines/tag/:tag`, `timelines/list/:id` (privacy group → `Network?gid=`),
  `statuses/:id`, `statuses/:id/context` (thread nesting by `thr_parent`), `accounts/:id`,
  `accounts/:id/statuses` (`Channel`), `accounts/lookup`, `accounts/relationships`,
  `v2/search` (`Find` + `Search` URL import + directory), `notifications` (`Notifications`),
  `markers`, `lists` (privacy groups), `favourites`, `bookmarks` (`star`).
- [ ] **Write**: `POST statuses` (+ `in_reply_to_id`, `visibility`, `spoiler_text`, `poll`,
  `media_ids`, `scheduled_at` → delayed publishing), `PUT statuses/:id` (edit), `DELETE statuses/:id`,
  `favourite`/`unfavourite`, `reblog`/`unreblog`, `bookmark`/`unbookmark` (star),
  `POST v2/media` + `PUT v1/media/:id`, `accounts/:id/follow|unfollow|block|mute`,
  `polls/:id/votes`, `notifications/clear|dismiss`.
- [ ] **Later / stub**: `filters` (empty list), `announcements` (`[]`), `trends` (`[]`),
  `conversations` (DMs via `Network?dm=1`), `followed_tags`, `push/subscription` (Web Push — the
  theme's `webpush.php` already sends pushes; Mastodon's push uses a different subscription format).
- [ ] **Streaming** (`/api/v1/streaming`, WebSocket/SSE): no realtime transport exists (TUI gap
  G-realtime). Return 404 or leave the route out. Clients fall back to polling, so this
  is not a blocker.

### Mapping problems to settle before writing adapters

- **Entities**: one `Concerns/MastodonEntities.php` with `status(formatItem() result)`,
  `account(xchan)`, `notification()`, `mediaAttachment(attach)`. Build them from
  `formatItem()` output so new item fields arrive in both APIs at once.
- **IDs**: Mastodon ids are opaque strings, but several clients sort or compare them
  numerically (Tusky compares by length, then lexically). Status id = `item.id` (monotonic int).
  For account ids, xchan hashes are long base64 strings that sort meaninglessly, so use
  `abook_id` for connections and give other xchans a stable numeric alias (new table or
  `xconfig`). **Decision needed.**
- **Pagination**: Mastodon clients page with `max_id`/`since_id`/`min_id` + `Link` header, but `/spa` streams
  use an offset (`start`). Add an id-cursor option to the underlying stream queries (an
  additive `max_id` param on `Network`/`Channel`/`Pubstream`). Do not translate to offsets,
  because offsets drift as new posts arrive.
- **Content**: Mastodon `content` is sanitised HTML. Render bbcode/markdown server-side with
  core's `bbcode()` (what federation sends), not the SPA's `bbcode.ts`. Keep the raw source for
  `GET statuses/:id/source` (edit). `spoiler_text` ↔ Hubzilla's `summary`.
- **Visibility ↔ ACL** (the lossy part): `public` → public; `unlisted` → public + `item_unpublished`
  rules as core's "don't show in public stream"; `private` → `public_policy = 'contacts'`;
  `direct` → `allow_cid` = mentioned accounts. Reading back, any custom ACL (privacy group,
  specific people) is reported as `private` (or `direct` for a single recipient). Clients can't
  show it, but they must not be shown as `public`. Editing a status through the Mastodon API must
  **keep** its existing ACL, not reset it to the coarse visibility.
- **What doesn't map**: articles, cards, wiki, webpages, events (as `Status` they lose their
  structure; expose events read-only as statuses at most), nomadic identity/clones (invisible to
  clients, fine), multiple channels per account (one token = one channel; Mastodon multi-account
  clients already handle this as separate logins).
- **Reactions**: Hubzilla has like/dislike/RSVP. Map `favourite` ↔ like. Expose
  dislikes/RSVP via Pleroma's `pleroma.emoji_reactions`-style extension only if a target client
  reads it.

## Consumers / process

Everything here is **additive** (new routes, new optional params such as `max_id`), so per the
umbrella `CLAUDE.md` no existing consumer breaks. When built:

- Close G1 in `hz-rust-tui/docs/SERVER-GAPS.md` (Phase 0 is its proposal) and update
  `API-ASSUMPTIONS.md`.
- Document the new surfaces in `3-data/api-reference.md` and `3-data/php-api.md`.
- Test against ddev with the throwaway `utsuktaspike` channel and a real client (Tusky on an
  emulator, Elk/Phanpy in a browser pointed at `https://hz-ddev.ddev.site`), never a production hub.

## Suggested order

1. Phase 0 bearer auth + scopes (also unblocks the TUI).
2. Phase 0 OAuth (PKCE, refresh, `/api/v1/apps`) + the routing decision for `/api` and `/oauth`.
3. Phase 2 boot + read endpoints: a client can sign in and browse.
4. Phase 2 write endpoints: a client is usable day to day. **This is where the stated goal is met.**
5. Phase 1 AP C2S on the same foundation (outbox POST, then inbox/outbox GET, uploadMedia).
6. Stubs, push, and streaming once a realtime transport exists.
