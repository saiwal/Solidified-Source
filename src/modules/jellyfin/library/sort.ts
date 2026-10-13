// Sort options per list, kept in the URL (?sort=<id>&dir=asc|desc) so Back
// and reloads keep the order. Each option has the direction people expect
// first: names A→Z, dates and counts newest/most first.
import { useSearchParams } from "@solidjs/router";
import type { Sort } from "../api";

export type SortList = "albums" | "artists" | "library";

export interface SortOption {
  id: string;
  by: string;
  desc: boolean;
  label:
    | "jellyfin.sort_name" | "jellyfin.sort_added" | "jellyfin.sort_released" | "jellyfin.sort_rating"
    | "jellyfin.sort_runtime" | "jellyfin.sort_watched" | "jellyfin.sort_random" | "jellyfin.sort_artist"
    | "jellyfin.sort_year" | "jellyfin.sort_played" | "jellyfin.sort_most_played";
}

const name: SortOption = { id: "name", by: "SortName", desc: false, label: "jellyfin.sort_name" };
const added: SortOption = { id: "added", by: "DateCreated,SortName", desc: true, label: "jellyfin.sort_added" };
const random: SortOption = { id: "random", by: "Random", desc: false, label: "jellyfin.sort_random" };

export const SORTS: Record<SortList, SortOption[]> = {
  library: [
    name, added,
    { id: "released", by: "PremiereDate,ProductionYear,SortName", desc: true, label: "jellyfin.sort_released" },
    { id: "rating", by: "CommunityRating,SortName", desc: true, label: "jellyfin.sort_rating" },
    { id: "runtime", by: "Runtime,SortName", desc: false, label: "jellyfin.sort_runtime" },
    { id: "watched", by: "DatePlayed,SortName", desc: true, label: "jellyfin.sort_watched" },
    random,
  ],
  albums: [
    name,
    { id: "artist", by: "AlbumArtist,SortName", desc: false, label: "jellyfin.sort_artist" },
    { id: "year", by: "ProductionYear,SortName", desc: true, label: "jellyfin.sort_year" },
    added,
    { id: "played", by: "DatePlayed,SortName", desc: true, label: "jellyfin.sort_played" },
    { id: "most", by: "PlayCount,SortName", desc: true, label: "jellyfin.sort_most_played" },
    random,
  ],
  artists: [name, added, random],
};

export function useSort(list: () => SortList) {
  const [params, setParams] = useSearchParams();
  const option = (): SortOption => SORTS[list()].find((o) => o.id === params.sort) ?? SORTS[list()][0];
  const desc = () => (params.dir === "asc" ? false : params.dir === "desc" ? true : option().desc);
  const sort = (): Sort => ({ by: option().by, desc: desc() });
  /** Picking an option resets the direction to that option's natural one. */
  const pick = (id: string) => setParams({ sort: id === SORTS[list()][0].id ? undefined : id, dir: undefined });
  const flip = () => setParams({ dir: desc() ? "asc" : "desc" });
  return { option, desc, sort, pick, flip, options: () => SORTS[list()] };
}
