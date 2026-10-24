import { createSignal } from "solid-js";
import { MdFillStar, MdOutlineStar_border } from "solid-icons/md";
import { useI18n } from "@utsukta/spa-core/i18n";
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { queryClient } from "@utsukta/spa-core/lib/query-client";
import { refetchNavData } from "@utsukta/spa-core/store/nav-store";
import { toast } from "@utsukta/spa-core/store/toast";
import { IconButton } from "@ui/Button";

export type FavoriteTarget = { name: string } | { url: string } | { path: string };

/**
 * Pin/unpin an app (Hubzilla's nav_pinned_app = a favorite). Settings knows
 * an app by its canonical `name`; the nav only by its raw `url` (/spa/nav
 * names are translated); an SPA-only module, with no app, by its nav `path`.
 * Un-favoriting keeps the app in the nav.
 */
export async function setAppFavorite(target: FavoriteTarget, on: boolean): Promise<void> {
  const res = await apiFetch("/spa/settings/integrations", {
    method: "POST",
    body: JSON.stringify({ ...target, action: "pin", enabled: on }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Server error ${res.status}`);
  }
  await Promise.all([
    refetchNavData(),
    queryClient.invalidateQueries({ queryKey: ["settings", "integrations"] }),
  ]);
}

/** Star toggle for one app; filled when it's a favorite. */
export function FavoriteStar(props: {
  on: boolean;
  target: FavoriteTarget;
  class?: string;
  size?: number;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = createSignal(false);
  return (
    <IconButton
      size="sm"
      label={props.on ? t("layout.remove_favorite") : t("layout.add_favorite")}
      pressed={props.on}
      disabled={busy()}
      class={`${props.on ? "text-accent-txt" : ""} ${props.class ?? ""}`}
      onClick={async (e) => {
        // Often sits on top of a nav link.
        e.preventDefault();
        e.stopPropagation();
        setBusy(true);
        try {
          await setAppFavorite(props.target, !props.on);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error");
        } finally {
          setBusy(false);
        }
      }}
    >
      {props.on ? <MdFillStar size={props.size ?? 16} /> : <MdOutlineStar_border size={props.size ?? 16} />}
    </IconButton>
  );
}
