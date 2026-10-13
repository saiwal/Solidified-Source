// Music | Video — the library's two halves, kept in the URL (?section=video)
// so a reload or Back lands where you were.
import { useSearchParams } from "@solidjs/router";

export type Section = "music" | "video";

/** Every param that opens a page inside the library — cleared when switching halves. */
export const PAGE_PARAMS = {
  album: undefined, artist: undefined, playlist: undefined, item: undefined, series: undefined,
  watch: undefined, t: undefined, search: undefined, view: undefined,
} as const;

export function useSection() {
  const [params, setParams] = useSearchParams();
  const section = (): Section => (params.section === "video" ? "video" : "music");
  const go = (s: Section) => setParams({ ...PAGE_PARAMS, section: s === "music" ? undefined : s });
  return { section, go };
}
