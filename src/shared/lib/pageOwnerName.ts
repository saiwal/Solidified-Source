// Display name of the channel whose page this is, for "<Name>'s files"-style
// headers — or null when the viewer owns the page (they get "My …" instead).
//
// Same query key and payload as the channel module's ContactCardWidget, so on
// a page showing both the owner's profile is fetched once. Call it from a slot
// widget: Slot mounts those only after auth loads, so viewerRole() is settled.
import { apiFetch } from "@utsukta/spa-core/lib/fetch";
import { createQueryResource } from "@utsukta/spa-core/lib/createQueryResource";
import { usePageNick, useViewerRole } from "@utsukta/spa-core/store/site-config";

async function fetchProfile(nick: string): Promise<{ channel_name: string } | null> {
  const res = await apiFetch(`/spa/profile/${nick}`);
  return res.ok ? (await res.json()).data : null;
}

export function usePageOwnerName(): () => string | null {
  const nick = usePageNick();
  const viewerRole = useViewerRole();
  // No nick in the URL (e.g. /cdav/calendar) means the viewer's own page.
  const isOwner = () => viewerRole() === "owner" || !nick();
  const [profile] = createQueryResource("contact-card", () => !isOwner() && nick(), fetchProfile);
  // The nick stands in until the name arrives.
  return () => (isOwner() ? null : profile()?.channel_name || nick()!);
}
