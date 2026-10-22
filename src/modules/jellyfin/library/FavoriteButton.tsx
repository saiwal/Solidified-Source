// Heart toggle, synced with Jellyfin. Optimistic — flips at once, reverts if
// the server refuses — and refreshes the Favourites tab afterwards.
import { createSignal, createEffect } from "solid-js";
import { useQueryClient } from "@utsukta/spa-core/lib/query";
import { MdFillFavorite, MdOutlineFavorite_border } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { setFavorite, type JellyfinSession, type JfItem } from "../api";

export default function FavoriteButton(props: { s: JellyfinSession; item: JfItem; size?: number }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [fav, setFav] = createSignal(!!props.item.UserData?.IsFavorite);
  createEffect(() => setFav(!!props.item.UserData?.IsFavorite));

  const flip = async (e: MouseEvent) => {
    e.stopPropagation();
    const want = !fav();
    setFav(want);
    try {
      setFav(await setFavorite(props.s, props.item.Id, want));
      void qc.invalidateQueries({ queryKey: ["jellyfin", props.s.server, props.s.userId, "favorites"] });
    } catch {
      setFav(!want);
    }
  };

  return (
    <button type="button" onClick={flip} aria-pressed={fav()}
      title={fav() ? t("jellyfin.unfavorite") : t("jellyfin.favorite")}
      class={`p-1 shrink-0 transition-colors ${fav() ? "text-danger-txt" : "text-muted hover:text-txt"}`}>
      {fav() ? <MdFillFavorite size={props.size ?? 16} /> : <MdOutlineFavorite_border size={props.size ?? 16} />}
    </button>
  );
}
