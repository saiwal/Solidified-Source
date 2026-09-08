// The one class list that styles rendered post bodies — used by PostCard for a
// published post *and* by the RichEditor's WYSIWYG surface, so a code block,
// quote or list looks the same while composing as it does once posted. The
// editor used to carry its own hand-rolled element rules
// (".rich-editor [contenteditable] pre" and friends) which drifted from these.
export const POST_PROSE =
  "prose prose-sm dark:prose-invert max-w-none " +
  "prose-a:text-accent prose-a:no-underline prose-a:hover:underline " +
  "prose-blockquote:not-italic prose-blockquote:border-accent " +
  "prose-code:bg-overlay prose-code:px-1 prose-code:rounded prose-code:text-sm prose-code:text-txt " +
  "prose-code:before:content-none prose-code:after:content-none " +
  "prose-img:rounded-lg prose-img:my-2 break-words";
