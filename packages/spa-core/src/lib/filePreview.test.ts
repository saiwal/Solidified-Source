// node --experimental-strip-types packages/spa-core/src/lib/filePreview.test.ts
import assert from "node:assert";
import { classifyPreview, parseCsv } from "./filePreview.ts";

assert.deepEqual(parseCsv('a,b\n1,"x, ""y"""\r\n2,"multi\nline"'), [["a", "b"], ["1", 'x, "y"'], ["2", "multi\nline"]]);
assert.deepEqual(parseCsv("a\tb\n1\t2\n", "\t"), [["a", "b"], ["1", "2"]]);
assert.deepEqual(parseCsv("a,,\n"), [["a", "", ""]]);

assert.equal(classifyPreview("", "data.tsv"), "csv");
assert.equal(classifyPreview("application/json", "x"), "json");
assert.equal(classifyPreview("application/json", "scene.excalidraw"), "excalidraw");
assert.equal(classifyPreview("", "post.bb"), "bbcode");
assert.equal(classifyPreview("", "page.htm"), "html");
assert.equal(classifyPreview("", "config.toml"), "text");
console.log("ok");
