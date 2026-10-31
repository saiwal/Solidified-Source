/**
 * The pure half of find & replace (FindReplace.tsx): the surface's text as one
 * string, so a phrase split by formatting still matches, mapped back to DOM
 * positions.
 */

export interface Seg { node: Text; start: number }

/** Every editable text node under `root`, and their text joined. */
export function textIndex(root: Node): { text: string; segs: Seg[] } {
  const segs: Seg[] = [];
  let text = "";
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      (n.parentElement as Element | null)?.closest("[contenteditable=false]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    segs.push({ node: n as Text, start: text.length });
    text += (n as Text).data;
  }
  return { text, segs };
}

/** Start offsets of every non-overlapping occurrence of `q` in `text`. */
export function findAll(text: string, q: string, matchCase: boolean): number[] {
  if (!q) return [];
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? q : q.toLowerCase();
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

/** The DOM position of flat offset `at`. */
export function locate(segs: Seg[], at: number, end: boolean): [Text, number] {
  // For an end point, prefer the node the text ends in over the next one's start.
  let i = segs.length - 1;
  while (i > 0 && (end ? segs[i].start >= at : segs[i].start > at)) i--;
  return [segs[i].node, at - segs[i].start];
}
