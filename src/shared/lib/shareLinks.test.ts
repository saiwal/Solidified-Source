// node --experimental-strip-types src/shared/lib/shareLinks.test.ts
import assert from "node:assert";

(globalThis as any).window = { location: { origin: "https://hub.example" } };

const { buildShareBody, shareTargetForPost, shareTargetForPhoto } = await import("./shareLinks.ts");

// Public items use the compact [share=] token the server expands.
assert.equal(
  buildShareBody({ url: "https://hub.example/display/abc", title: "Hi", iid: 42 }),
  "\n[share=42][/share]\n",
);

// Private items can't be embedded — [share] refuses them — so they fall back
// to link + quote.
assert.equal(
  buildShareBody({ url: "https://hub.example/display/abc", title: "Hi", quote: "Body", iid: 42, itemPrivate: true }),
  "[url=https://hub.example/display/abc]Hi[/url]\n\n[quote]Body[/quote]",
);

// No iid at all (articles/cards without a local item) behaves the same way.
assert.equal(
  buildShareBody({ url: "https://hub.example/p/1" }),
  "[url=https://hub.example/p/1]https://hub.example/p/1[/url]",
);

// A private post exposes no embed row and never emits [share=].
const priv = shareTargetForPost({
  uuid: "u1", iid: 7, permalink: "", title: "T", body: "<p>hello</p>",
  authorName: "A", flags: ["private"],
} as any);
assert.equal(priv.url, "https://hub.example/display/u1");
assert.equal(priv.embed, undefined);
assert(!priv.postBody!.includes("[share="));

// permalink wins over the local route when present (it may be a remote hub).
const pub = shareTargetForPost({
  uuid: "u2", iid: 8, permalink: "https://other.example/item/9", title: "",
  body: "", authorName: "A", flags: [],
} as any);
assert.equal(pub.url, "https://other.example/item/9");
assert.equal(pub.embed?.[0].code, "[share=8][/share]");

// Photos embed the medium (-2) variant rather than whatever size was listed.
const photo = shareTargetForPhoto("bob", {
  resource_id: "r1", title: "Sunset", description: "on the pier",
  src: "https://hub.example/photo/r1-3.jpg",
} as any);
assert.equal(photo.url, "https://hub.example/photos/bob/image/r1");
assert(photo.postBody!.startsWith("[img]https://hub.example/photo/r1-2.jpg[/img]"));
assert.equal(photo.embed?.[0].code, "[zmg]https://hub.example/photo/r1-2.jpg[/zmg]");
assert.equal(photo.restricted, false);

// A photo the audience can't fetch (own ACL, or a private album folder) is
// flagged so the share sheet can warn before it posts a broken image.
const locked = shareTargetForPhoto("bob", {
  resource_id: "r2", title: "", description: "",
  src: "https://hub.example/photo/r2-2.jpg", is_private: true,
} as any);
assert.equal(locked.restricted, true);

console.log("shareLinks: ok");
