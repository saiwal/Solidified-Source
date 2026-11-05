// node --experimental-strip-types packages/spa-core/src/lib/wikilinks.test.ts
import assert from "node:assert";
import { linkWikilinks } from "./wikilinks.ts";

assert.equal(linkWikilinks("<p>see [[Home Page]] now</p>"),
  '<p>see <a class="wikilink" href="/link/Home%20Page">Home Page</a> now</p>');
assert.equal(linkWikilinks("[[Page|the label]]"), '<a class="wikilink" href="/link/Page">the label</a>');
// Code and attributes are left alone.
assert.equal(linkWikilinks("<code>[[x]]</code>"), "<code>[[x]]</code>");
assert.equal(linkWikilinks('<pre class="a">\n[[x]]</pre>'), '<pre class="a">\n[[x]]</pre>');
assert.equal(linkWikilinks('<img alt="[[x]]">'), '<img alt="[[x]]">');
// Not a wikilink.
assert.equal(linkWikilinks("[[]] and [x]"), "[[]] and [x]");
assert.equal(linkWikilinks("[[i]] one [[/i]] two"), "[[i]] one [[/i]] two");
assert.equal(linkWikilinks("[[article:My Post]]"), '<a class="wikilink" href="/link/article%3AMy%20Post">My Post</a>');
assert.equal(linkWikilinks("[[Other Wiki/Page]]"), '<a class="wikilink" href="/link/Other%20Wiki%2FPage">Other Wiki/Page</a>');
console.log("ok wikilinks");
