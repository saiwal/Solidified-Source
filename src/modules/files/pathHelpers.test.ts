// node --experimental-strip-types src/modules/files/pathHelpers.test.ts
//
// The cloud URL path is what decides which folder the file list opens — a
// shared folder link, a post attachment link, the back button. Only the pure
// URL ⇄ display_path halves are covered here; resolveFolderPath() is a
// network walk over listFolder().
import assert from "node:assert";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// api.ts imports through Vite's "@/" alias and uses extensionless specifiers.
const srcDir = fileURLToPath(new URL("../../", import.meta.url));
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) return next(pathToFileURL(srcDir + spec.slice(2)).href + ".ts", ctx);
    return spec.startsWith(".") && !/\.[a-z]+$/i.test(spec) ? next(`${spec}.ts`, ctx) : next(spec, ctx);
  },
});

const { cloudPathSegments, cloudPath } = await import("./api.ts");

const SEGMENTS: Record<string, [string, string, string[]]> = {
  //                          pathname                     nick    → segments
  "root":                    ["/cloud/sk",                 "sk",   []],
  "root, trailing slash":    ["/cloud/sk/",                "sk",   []],
  "one folder":              ["/cloud/sk/tmp",             "sk",   ["tmp"]],
  "nested":                  ["/cloud/sk/tmp/sub",         "sk",   ["tmp", "sub"]],
  "percent-encoded space":   ["/cloud/sk/tmp/folder%202",  "sk",   ["tmp", "folder 2"]],
  "another channel's cloud": ["/cloud/bob/tmp",            "sk",   []],
  "not the cloud module":    ["/channel/sk/tmp",           "sk",   []],
};

for (const [name, [pathname, nick, expected]] of Object.entries(SEGMENTS)) {
  assert.deepStrictEqual(cloudPathSegments(pathname, nick), expected, name);
}

// Round trip: a display_path survives the URL and comes back segment for segment.
for (const displayPath of ["", "tmp", "tmp/folder 2", "a/b/c", "we#ird & name"]) {
  assert.deepStrictEqual(
    cloudPathSegments(cloudPath("sk", displayPath), "sk"),
    displayPath ? displayPath.split("/") : [],
    displayPath,
  );
}

console.log("pathHelpers: ok");
