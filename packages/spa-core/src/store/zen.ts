import { createSignal } from "solid-js";

// Zen mode for the composers — strips everything but the editor surface, its
// toolbar and the attachment bar. ComposerShell reads it to decide which of
// its regions to hide and to go full-viewport; the page-hosted composers read
// it to hand RichEditor `fill` (see WebpageComposer).
//
// Deliberately NOT wired into useLayoutChrome's chromeMode: hiding the app
// chrome there unmounts the widget slots, and the post/article/card composers
// are mounted BY widgets (ChannelFeedShell, HqComposer, DraftsWidget,
// ArticlesHeaderWidget) — entering zen destroyed the very composer that was
// entering it. ComposerShell's overlay covers the chrome instead.
//
// ponytail: global signal — one composer is open at a time; make it a context
// if two composers ever coexist.
export const [zenMode, setZenMode] = createSignal(false);
