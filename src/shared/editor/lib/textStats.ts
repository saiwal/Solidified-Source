/** Shared word-count logic for the composer word/char counters. */
export function countWords(text: string): number {
  // Tags aren't words — an html/wysiwyg body would otherwise count its markup.
  return text.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}
