// node --experimental-strip-types packages/spa-core/src/lib/unseen.test.ts
import assert from "node:assert";
import { isEntryUnseen } from "./unseen.ts";
import type { MessageEntry } from "./message-store.ts";

const e = (p: Partial<MessageEntry>): MessageEntry => ({
  b64mid: "x", created: "", summary: "", info: "",
  author_name: "", author_addr: "", href: "", icon: "", author_img: "",
  unseen_count: "", unseen_class: "secondary",
  ...p,
});

// The regression this file exists for: the root is read, three replies are not.
// `unseen: false` describes the thread top only and must not veto the replies.
assert.equal(isEntryUnseen(e({ unseen: false, unseen_count: 3 })), true,
  "a read root with unseen replies is still unread");

// Straightforward cases.
assert.equal(isEntryUnseen(e({ unseen: true })), true);
assert.equal(isEntryUnseen(e({ unseen: false })), false);
assert.equal(isEntryUnseen(e({})), false);

// Pre-existing signals, still honoured for entries cached before `unseen`
// existed (the field is optional on purpose).
assert.equal(isEntryUnseen(e({ unseen_class: "primary" })), true);
assert.equal(isEntryUnseen(e({ unseen_count: 1 })), true);
assert.equal(isEntryUnseen(e({ unseen_count: 0 })), false);

// The backend sends a non-numeric placeholder when the top item itself is
// unseen and has no replies yet — it must not be read as a count.
assert.equal(isEntryUnseen(e({ unseen_count: "&#8192;" })), false);
assert.equal(isEntryUnseen(e({ unseen_count: "&#8192;", unseen_class: "primary" })), true);

// Marking read clears both, which is what the inbox's setRead patches.
assert.equal(isEntryUnseen(e({ unseen: false, unseen_count: "", unseen_class: "secondary" })), false);

console.log("unseen: ok");
