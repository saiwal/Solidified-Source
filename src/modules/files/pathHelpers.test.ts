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

const { cloudPathSegments, cloudPath, pruneTree, parentPath, cloudKey } = await import("./api.ts");

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

// Tree search: hits become a tree with their ancestor folders filled in by path,
// folders before files, a hit that is itself a folder keeps its row (no dupes).
{
  const hit = (display_path: string, is_dir = false) =>
    ({ display_path, is_dir, filename: display_path.split("/").pop() }) as never;
  const shape = (ns: ReturnType<typeof pruneTree>): unknown =>
    ns.map((n) => [n.name, !!n.file, shape(n.children)]);
  assert.deepStrictEqual(
    shape(pruneTree([hit("b/z.png"), hit("a.txt"), hit("b", true), hit("b/c/d.png"), hit("b/a.png")])),
    [
      ["b", true, [["c", false, [["d.png", true, []]]], ["a.png", true, []], ["z.png", true, []]]],
      ["a.txt", true, []],
    ],
  );
  assert.deepStrictEqual(pruneTree([]), []);
  assert.strictEqual(parentPath("a/b/c.txt"), "a/b");
  assert.strictEqual(parentPath("c.txt"), "");
}

// Cloud bookmarks: same-origin /cloud/ URLs only, compared decoded, no trailing slash.
{
  const o = "https://hub.example";
  assert.strictEqual(cloudKey(`${o}/cloud/sk/tmp/folder%202/`, o), "/cloud/sk/tmp/folder 2");
  assert.strictEqual(cloudKey(`${o}/cloud/sk`, o), "/cloud/sk");
  assert.strictEqual(cloudKey(cloudPath("sk", "we#ird & name"), o), "/cloud/sk/we#ird & name");
  assert.strictEqual(cloudKey(`https://other.example/cloud/sk/tmp`, o), null);
  assert.strictEqual(cloudKey(`${o}/cloudy/sk`, o), null);
  assert.strictEqual(cloudKey(`${o}/channel/sk`, o), null);
}

// Toolbar/menu action rules (fileActions.ts): what each target may do.
{
  const { FILE_ACTIONS, actionShown, actionEnabled } = await import("./fileActions.ts");
  const file = { hash: "f1", display_path: "a/x.txt", filename: "x.txt", is_dir: false, filetype: "text/plain" } as never;
  const file2 = { hash: "f2", display_path: "a/y.txt", filename: "y.txt", is_dir: false, filetype: "text/plain" } as never;
  const folder = { hash: "d1", display_path: "a", filename: "a", is_dir: true } as never;
  const root = { hash: "", display_path: "", filename: "sk", is_dir: true } as never;
  const on = (items: never[], isFolder: boolean) =>
    FILE_ACTIONS.filter((a) => actionEnabled(a, items, isFolder, null)).map((a) => a.id);

  // wopiEdit needs a WOPI config — null here, so never on.
  assert.deepStrictEqual(on([file], false),
    ["share", "bookmark", "permissions", "rename", "moveCopy", "categories", "download", "delete"]);
  assert.deepStrictEqual(on([file, file2], false), ["permissions", "moveCopy", "download", "delete"]);
  // Open folder: everything single-target except delete.
  assert.deepStrictEqual(on([folder], true),
    ["share", "bookmark", "permissions", "rename", "moveCopy", "categories", "download"]);
  // Root has no attach row: bookmark only.
  assert.deepStrictEqual(on([root], true), ["bookmark"]);
  assert.deepStrictEqual(on([], true), []);
  // Office editing follows the WOPI mime list.
  const wopi = FILE_ACTIONS.find((a) => a.id === "wopiEdit")!;
  assert.strictEqual(actionEnabled(wopi, [file], false, { url: "u", types: ["text/plain"] }), true);
  assert.strictEqual(actionEnabled(wopi, [file], false, { url: "u", types: ["image/png"] }), false);

  // Visibility: visitors without grants see share + download only.
  const shown = (v: { canWrite: boolean; isOwner: boolean; isLocal: boolean }) =>
    FILE_ACTIONS.filter((a) => actionShown(a, v)).map((a) => a.id);
  assert.deepStrictEqual(shown({ canWrite: false, isOwner: false, isLocal: false }), ["share", "download"]);
  assert.strictEqual(shown({ canWrite: true, isOwner: true, isLocal: true }).length, FILE_ACTIONS.length);
}

console.log("pathHelpers: ok");
