// `ref={mergeRefs(a, b)}` — several ref callbacks on one element.
// ponytail: Solid 2 takes `ref={[a, b]}` natively; delete this then.
export const mergeRefs =
  <T>(...refs: (((el: T) => void) | undefined)[]) =>
  (el: T) => refs.forEach((r) => r?.(el));
