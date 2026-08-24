// node --experimental-strip-types src/shared/editor/lib/cardTemplates.test.ts
import assert from "node:assert";
import {
  composeTemplate, parseTemplate, sniffTemplate, emptyTemplateFields,
  type CardTemplate, type TemplateFields,
} from "./cardTemplates.ts";

const f = (over: Partial<TemplateFields>): TemplateFields => ({ ...emptyTemplateFields(), ...over });

// ── compose ──────────────────────────────────────────────────────────────────
assert.equal(
  composeTemplate("quote", f({ quoteText: "A book must be the axe", quoteAttribution: "Kafka" })),
  "[quote=Kafka]A book must be the axe[/quote]",
);
// No attribution → the plain [quote] core also renders.
assert.equal(composeTemplate("quote", f({ quoteText: "Anon" })), "[quote]Anon[/quote]");
assert.equal(
  composeTemplate("definition", f({ defTerm: "Ontology", defBody: "The study of being." })),
  "[b]Ontology[/b]\nThe study of being.",
);
assert.equal(
  composeTemplate("link", f({ linkUrl: "https://e.org", linkTitle: "Home", linkNote: "Read later" })),
  "[url=https://e.org]Home[/url]\nRead later",
);
// Missing title falls back to the URL as the label.
assert.equal(composeTemplate("link", f({ linkUrl: "https://e.org" })), "[url=https://e.org]https://e.org[/url]");

// Incomplete input yields "" so the submit button stays disabled rather than
// saving a half-built body.
assert.equal(composeTemplate("quote", f({ quoteAttribution: "Kafka" })), "");
assert.equal(composeTemplate("definition", f({ defTerm: "Ontology" })), "");
assert.equal(composeTemplate("link", f({ linkTitle: "Home" })), "");
assert.equal(composeTemplate("freeform", f({ quoteText: "x" })), "");

// ── sniff ────────────────────────────────────────────────────────────────────
assert.equal(sniffTemplate("[quote=Kafka]x[/quote]"), "quote");
assert.equal(sniffTemplate("[quote]x[/quote]"), "quote");
assert.equal(sniffTemplate("[url=https://e.org]Home[/url]"), "link");
assert.equal(sniffTemplate("[b]Term[/b]\nbody"), "definition");
assert.equal(sniffTemplate("just some prose"), null);
assert.equal(sniffTemplate("[i]italic[/i] lead"), null);

// ── round-trip: compose -> parse -> compose must be stable ───────────────────
const cases: Array<[CardTemplate, Partial<TemplateFields>]> = [
  ["quote",      { quoteText: "A book must be the axe", quoteAttribution: "Kafka" }],
  ["quote",      { quoteText: "No attribution here" }],
  ["definition", { defTerm: "Ontology", defBody: "The study of being.\nSecond line." }],
  ["link",       { linkUrl: "https://e.org/a?b=c&d=e", linkTitle: "Home", linkNote: "Read later" }],
  ["link",       { linkUrl: "https://e.org" }],
];
for (const [tpl, fields] of cases) {
  const body = composeTemplate(tpl, f(fields));
  assert.equal(sniffTemplate(body), tpl, `sniff ${tpl}: ${body}`);
  const reassembled = composeTemplate(tpl, { ...emptyTemplateFields(), ...parseTemplate(body) });
  assert.equal(reassembled, body, `round-trip ${tpl}`);
}

// A body a template did not produce must parse to nothing, so opening a
// freeform card on a template tab can't silently truncate it.
assert.deepEqual(parseTemplate("plain prose with [b]bold[/b] inside"), {});

// ── link: the card's Title is the label ──────────────────────────────────────
// The composer has no separate link-title input; opts.title wins over the
// parsed fallback so renaming the card renames the link.
assert.equal(
  composeTemplate("link", f({ linkUrl: "https://e.org", linkTitle: "Stale" }), { title: "On Habit" }),
  "[url=https://e.org]On Habit[/url]",
);
// A blank/whitespace title falls back rather than emitting an empty label.
assert.equal(
  composeTemplate("link", f({ linkUrl: "https://e.org", linkTitle: "Home" }), { title: "   " }),
  "[url=https://e.org]Home[/url]",
);
// opts never rescue a missing URL.
assert.equal(composeTemplate("link", f({}), { title: "On Habit", includeImage: true }), "");

// ── link: the opt-in og:image thumbnail ──────────────────────────────────────
const withImg = f({
  linkUrl: "https://e.org/a",
  linkNote: "Read later",
  linkImage: "https://e.org/og.png",
});
// Unticked, the image is carried but never emitted.
assert.equal(
  composeTemplate("link", withImg, { title: "On Habit" }),
  "[url=https://e.org/a]On Habit[/url]\nRead later",
);
const imgBody = composeTemplate("link", withImg, { title: "On Habit", includeImage: true });
assert.equal(
  imgBody,
  "[url=https://e.org/a][img]https://e.org/og.png[/img][/url]\n" +
  "[url=https://e.org/a]On Habit[/url]\nRead later",
);
// A thumbnail must not confuse the tab sniffer or the label parser.
assert.equal(sniffTemplate(imgBody), "link");
const backImg = parseTemplate(imgBody);
assert.equal(backImg.linkImage, "https://e.org/og.png");
assert.equal(backImg.linkUrl, "https://e.org/a");
assert.equal(backImg.linkTitle, "On Habit");   // the second [url], not the thumbnail's
assert.equal(backImg.linkNote, "Read later");
assert.equal(composeTemplate("link", f(backImg), { title: "On Habit", includeImage: true }), imgBody);
// Unticking the box drops the thumbnail and nothing else.
assert.equal(
  composeTemplate("link", f(backImg), { title: "On Habit" }),
  "[url=https://e.org/a]On Habit[/url]\nRead later",
);
// An imageless link body reports no image, so re-editing can't invent one.
assert.equal(parseTemplate("[url=https://e.org]Home[/url]").linkImage, "");

console.log("cardTemplates: all assertions passed");
