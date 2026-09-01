// node --experimental-strip-types packages/spa-core/src/lib/renderBody.test.ts
//
// Guards the per-mimetype dispatch against core's prepare_text()
// (include/text.php:2083). This tests the format *choice* — where the
// compatibility bugs live — not the converters themselves, so bbcode.ts and
// dompurify are stubbed; both reach for browser globals. The extension fixup
// is only because the source uses bundler-style extensionless relative
// imports, which bare Node does not resolve.
import assert from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const BBCODE_STUB = "export const bbcodeToHtml = (s) => '<BB>' + s + '</BB>';";

// Stands in for DOMPurify: strips from the first <script onward, which is all
// the assertions below need to tell "sanitized" from "passed through raw".
const PURIFY_STUB = [
  "export default { sanitize: (h) => {",
  "  const s = String(h); const i = s.indexOf('<script');",
  "  return i === -1 ? s : s.slice(0, i);",
  "} };",
].join("\n");

const LOADER = [
  "const BB = " + JSON.stringify(BBCODE_STUB) + ";",
  "const DP = " + JSON.stringify(PURIFY_STUB) + ";",
  "export async function resolve(spec, ctx, next) {",
  "  if (spec === 'dompurify') return { url: 'stub:dompurify', shortCircuit: true };",
  "  if (spec === './bbcode') return { url: 'stub:bbcode', shortCircuit: true };",
  "  if (spec.startsWith('.') && !spec.includes('.ts')) return next(spec + '.ts', ctx);",
  "  return next(spec, ctx);",
  "}",
  "export async function load(url, ctx, next) {",
  "  if (url === 'stub:dompurify') return { format: 'module', shortCircuit: true, source: DP };",
  "  if (url === 'stub:bbcode') return { format: 'module', shortCircuit: true, source: BB };",
  "  return next(url, ctx);",
  "}",
].join("\n");

register("data:text/javascript," + encodeURIComponent(LOADER), pathToFileURL("./"));

const { renderBody, needsServerRender } = await import("./renderBody.ts");

// item.mimetype defaults to '' in the schema and core's prepare_text() falls
// through to the bbcode branch on `case '':`. Undefined/null must too.
assert.equal(renderBody("hi", ""), "<BB>hi</BB>");
assert.equal(renderBody("hi", undefined), "<BB>hi</BB>");
assert.equal(renderBody("hi", null), "<BB>hi</BB>");
assert.equal(renderBody("hi", "text/bbcode"), "<BB>hi</BB>");
// An unknown mimetype must not fall through to a raw passthrough.
assert.equal(renderBody("hi", "application/x-nonsense"), "<BB>hi</BB>");

// Markdown reaches us already un-escaped by ContentTypes::decode().
const md = renderBody("# Title\n\n- one\n- two", "text/markdown");
assert(md.includes("<h1"), md);
assert(md.includes("<li>"), md);

// text/plain and x-pdl are escaped, never parsed — core does escape_tags().
for (const mime of ["text/plain", "application/x-pdl"]) {
  const out = renderBody("<script>alert(1)</script>\n# not a heading", mime);
  assert(out.includes("&lt;script&gt;"), `${mime}: ${out}`);
  assert(!out.includes("<h1"), `${mime} must not parse markdown: ${out}`);
}

// Core escapes text/plain twice — once at save (z_input_filter) and again at
// display (prepare_text) — and gets away with it because escape_tags() is
// htmlspecialchars(double_encode: false). Our escape must be idempotent too,
// or a stored "&lt;b&gt;" renders as the literal text "&lt;b&gt;".
const storedPlain = 'plain &lt;b&gt;x&lt;/b&gt; &amp; &quot;q&quot;';
const shownPlain = renderBody(storedPlain, "text/plain");
assert(shownPlain.includes(storedPlain), shownPlain);
assert(!shownPlain.includes("&amp;lt;"), `double-escaped: ${shownPlain}`);
// A bare & still gets escaped, and a numeric entity is left alone.
assert(renderBody("a & b &#39; c", "text/plain").includes("a &amp; b &#39; c"));

// A bbcode body must never be handed to the markdown branch.
assert.equal(renderBody("# not a heading", "text/bbcode"), "<BB># not a heading</BB>");

// text/html is purified rather than trusted, even though core's prepare_text()
// passes it straight through on the strength of save-time HTMLPurifier.
assert.equal(renderBody("<p>ok</p><script>bad()</script>", "text/html"), "<p>ok</p>");

// The injected sanitizer is what the stream uses to apply its stricter allowlist.
assert.equal(renderBody("x", "text/html", undefined, (h) => `[${h}]`), "[x]");

// x-php is eval'd server-side; there is no client rendering of it, and callers
// must be told so they can link out instead of showing an empty panel.
assert.equal(renderBody("<?php echo 1; ?>", "application/x-php"), "");
assert(needsServerRender("application/x-php"));
assert(!needsServerRender(""));
assert(!needsServerRender("text/markdown"));

console.log("renderBody: ok");
