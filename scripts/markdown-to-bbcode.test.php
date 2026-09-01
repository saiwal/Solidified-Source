<?php
// Asserts ContentTypes::toBbcode() — the markdown -> bbcode conversion posts
// and comments go through on save (see Api/ContentTypes.php).
//
// Needs a live Hubzilla: markdown_to_bb() pulls in MarkdownExtra and
// html2bbcode via the full bootstrap, so this cannot run standalone in CI.
// Run it against ddev after `npm run build` has synced php/ into the theme:
//
//   cp scripts/markdown-to-bbcode.test.php ../hz-ddev/core/
//   (cd ../hz-ddev && ddev exec "cd /var/www/html/core && php markdown-to-bbcode.test.php")
//   rm ../hz-ddev/core/markdown-to-bbcode.test.php
chdir('/var/www/html/core');
require_once('include/cli_startup.php'); cli_startup();
require_once('extend/theme/utsukta-themes/solidified/vendor/autoload.php');

use Utsukta\SpaCore\Api\ContentTypes;

$fails = 0;
function check(string $label, $got, $want): void {
    global $fails;
    $ok = is_callable($want) ? $want($got) : ($got === $want);
    if (!$ok) { $fails++; echo "FAIL $label\n  got: " . json_encode($got) . "\n"; }
}
$bb = fn(string $md) => ContentTypes::toBbcode($md, 'text/markdown')[0];
$has = fn(string $needle) => fn($got) => str_contains($got, $needle);

// Non-markdown input passes through untouched, mimetype included.
check('bbcode passthrough', ContentTypes::toBbcode('[b]x[/b]', 'text/bbcode'), ['[b]x[/b]', 'text/bbcode']);
check('html passthrough',   ContentTypes::toBbcode('<p>x</p>', 'text/html'),   ['<p>x</p>', 'text/html']);
// Markdown always comes back as bbcode.
check('mimetype becomes bbcode', ContentTypes::toBbcode('# x', 'text/markdown')[1], 'text/bbcode');

check('heading',  $bb('## Hello'),                    $has('[h2]Hello[/h2]'));
check('emphasis', $bb('*em* and **strong**'),         $has('[i]em[/i]'));
check('strong',   $bb('*em* and **strong**'),         $has('[b]strong[/b]'));
check('list',     $bb("- one\n- two"),                $has('[list]'));
check('ordered',  $bb("1. first\n2. second"),         $has('[list=1]'));
check('link',     $bb('[link](https://example.com)'), $has('[url=https://example.com]link[/url]'));
check('image',    $bb('![i](https://e.com/a.png)'),   $has('[img'));
check('code',     $bb('`code`'),                      $has('[code]code[/code]'));
check('quote',    $bb("> quoted"),                    $has('[quote]'));
check('table',    $bb("| a | b |\n|---|---|\n| 1 | 2 |"), $has('[table]'));

// GFM that PHP Markdown Extra does not know, mapped to bbcode by gfmToBbcode()
// so the posted item matches what the composer showed (marked parses both).
check('strikethrough',      $bb('~~struck~~'),        $has('[s]struck[/s]'));
check('strike inline',      $bb('a ~~b~~ c'),         $has('a [s]b[/s] c'));
check('strike left in code', $bb('`~~keep~~`'),       $has('[code]~~keep~~[/code]'));
check('task list',          $bb("- [ ] todo\n- [x] done"), $has('[checklist]'));
check('task unchecked',     $bb("- [ ] todo"),        $has('[] todo'));
check('task checked',       $bb("- [x] done"),        $has('[x] done'));
// A plain list, and a list item that merely starts with a link, must not be
// mistaken for a task list.
check('plain list untouched', $bb("- one\n- two"),    $has('[list]'));
check('link item untouched',  $bb('- [link](https://x.com)'), $has('[url=https://x.com]link[/url]'));

// Hashtags and mentions must survive: the caller runs linkify_tags() on the
// converted body, and it can only find them if they came through intact.
check('hashtag survives', $bb('Hello #hashtag there'), $has('#hashtag'));
check('mention survives', $bb('Hi @{Some Person}'),    $has('@{Some Person}'));

// preserve_lf: a single newline must stay a newline, or posts reflow.
check('soft line break kept', $bb("line one\nline two"), $has("line one\nline two"));

// Load-bearing: with the "Markdown" feature on, the composer body is markdown but
// the toolbar still inserts bbcode, AttachmentBar appends [attachment] tags and
// image inserts emit [zmg]/[zrl]. All of that has to survive the conversion
// untouched, or turning the feature on quietly breaks attachments and mentions.
check('bb bold passthrough',   $bb('some [b]bold[/b] text'),          $has('[b]bold[/b]'));
check('bb url passthrough',    $bb('a [url=https://x.com]l[/url]'),   $has('[url=https://x.com]l[/url]'));
check('bb img passthrough',    $bb('[img]https://x.com/a.png[/img]'), $has('[img]https://x.com/a.png[/img]'));
check('bb code passthrough',   $bb('[code]x = 1[/code]'),             $has('[code]x = 1[/code]'));
check('attachment tag kept',   $bb('[attachment]abc123,0[/attachment]'), $has('[attachment]abc123,0[/attachment]'));
check('zrl/zmg kept',          $bb('[zrl=https://x.com/a][zmg=https://x.com/b.png]l[/zmg][/zrl]'),
                               $has('[zmg=https://x.com/b.png]l[/zmg]'));
// Markdown and bbcode may be mixed in one body; both must come out as bbcode.
check('mixed md + bb',         $bb('**md** and [b]bb[/b]'),           $has('[b]md[/b] and [b]bb[/b]'));

// ── Remembering the Markdown source across an edit ────────────────────────
// toBbcode() is one-way, so a post composed in Markdown would reopen as the
// converted bbcode without this. Needs a real item row for the iconfig.
$row = q("SELECT id FROM item WHERE item_type = 0 AND item_deleted = 0 ORDER BY id DESC LIMIT 1");
if ($row) {
    $iid = intval($row[0]['id']);
    $md  = "## Notes\n\n- one\n- two\n\nSee [docs](https://example.com). #tag";
    [$bbody] = ContentTypes::toBbcode($md, 'text/markdown');

    ContentTypes::rememberMarkdown($iid, $md, $bbody);
    check('recall returns the markdown', ContentTypes::recallMarkdown($iid, $bbody), $md);
    // Edited elsewhere (classic UI, a clone, an addon): the source is stale and
    // restoring it would silently revert that edit.
    check('stale body is not restored', ContentTypes::recallMarkdown($iid, $bbody . ' edited'), '');
    // Re-saved as bbcode: an old source must not resurrect on a later edit.
    ContentTypes::forgetMarkdown($iid);
    check('forgotten source stays gone', ContentTypes::recallMarkdown($iid, $bbody), '');

    // iconfig deserializes values that look like JSON or a PHP array; Markdown
    // starting with those must come back intact, or at worst fall back safely.
    foreach (['[link](u) first', '{ "a": 1 }', 'json: not really'] as $tricky) {
        [$tbb] = ContentTypes::toBbcode($tricky, 'text/markdown');
        ContentTypes::rememberMarkdown($iid, $tricky, $tbb);
        $back = ContentTypes::recallMarkdown($iid, $tbb);
        check('tricky source ' . json_encode($tricky), ($back === $tricky || $back === ''), true);
    }
    ContentTypes::forgetMarkdown($iid);
} else {
    echo "  (skipped markdown-memory checks: no item rows)\n";
}

echo $fails ? "\n$fails check(s) failed\n" : "mdconv: ok\n";
exit($fails ? 1 : 0);
