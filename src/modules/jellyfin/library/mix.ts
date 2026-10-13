import { toast } from "@utsukta/spa-core/store/toast";
import type { useI18n } from "@utsukta/spa-core/i18n";
import { instantMix, type JellyfinSession, type JfItem } from "../api";
import { playList } from "../store";

/** Replace the queue with Jellyfin's Instant Mix seeded from `seed`. */
export async function startMix(s: JellyfinSession, seed: JfItem, t: ReturnType<typeof useI18n>["t"]): Promise<void> {
  try {
    const mix = await instantMix(s, seed.Id);
    if (!mix.Items.length) return void toast.info(t("jellyfin.mix_empty"));
    playList(s, mix.Items);
  } catch {
    toast.error(t("jellyfin.err_load"));
  }
}
