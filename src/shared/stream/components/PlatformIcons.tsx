// Fediverse-platform badges next to a post author, keyed by nodeinfo's
// lowercased software.name. Real brand icons (see
// src/assets/icons/platforms/NOTICE.md for sources/licensing) for the
// software with a confidently-sourced official mark; everything else in
// fedidb.com/software's top 50 by user count gets a letter monogram instead
// (see PLATFORM_MONOGRAMS below).

import { Show, Suspense, type JSX } from "solid-js";
import { MdOutlineHelp_outline } from "solid-icons/md";
import { usePlatformSoftware } from "@utsukta/spa-core/lib/usePlatformSoftware";
import mastodonIcon from "@/assets/icons/platforms/mastodon.svg";
import friendicaIcon from "@/assets/icons/platforms/friendica.svg";
import hubzillaIcon from "@/assets/icons/platforms/hubzilla.svg";
import diasporaIcon from "@/assets/icons/platforms/diaspora.svg";
import pleromaIcon from "@/assets/icons/platforms/pleroma.svg";
import pixelfedIcon from "@/assets/icons/platforms/pixelfed.svg";
import misskeyIcon from "@/assets/icons/platforms/misskey.svg";
import peertubeIcon from "@/assets/icons/platforms/peertube.svg";
import lemmyIcon from "@/assets/icons/platforms/lemmy.svg";
import piefedIcon from "@/assets/icons/platforms/piefed.svg";
import wordpressIcon from "@/assets/icons/platforms/wordpress.svg";
import nodebbIcon from "@/assets/icons/platforms/nodebb.svg";
import ghostIcon from "@/assets/icons/platforms/ghost.svg";
import firefishIcon from "@/assets/icons/platforms/firefish.svg";
import forgejoIcon from "@/assets/icons/platforms/forgejo.svg";
import activitypubIcon from "@/assets/icons/platforms/activitypub.svg";
import rssIcon from "@/assets/icons/platforms/rss.svg";

const PLATFORM_ICON_SRC: Record<string, string> = {
  mastodon: mastodonIcon,
  friendica: friendicaIcon,
  hubzilla: hubzillaIcon,
  diaspora: diasporaIcon,
  pleroma: pleromaIcon,
  pixelfed: pixelfedIcon,
  misskey: misskeyIcon,
  peertube: peertubeIcon,
  lemmy: lemmyIcon,
  piefed: piefedIcon,
  wordpress: wordpressIcon,
  nodebb: nodebbIcon,
  ghost: ghostIcon,
  firefish: firefishIcon,
  forgejo: forgejoIcon,
};

interface Monogram {
  letter: string;
  cls: string;
}

// No standalone logo asset available for these (or, for "loops"/"plume", the
// only simple-icons match is an unrelated same-named brand) — fall back to a
// letter monogram. Covers the rest of fedidb.com/software's top 50 by user
// count as of 2026-08-21, plus this theme's own zot6-fork siblings.
const PLATFORM_MONOGRAMS: Record<string, Monogram> = {
  streams: { letter: "S", cls: "bg-violet-500 text-white" },
  forte: { letter: "Fo", cls: "bg-violet-500 text-white" },
  writefreely: { letter: "Wr", cls: "bg-violet-500 text-white" },
  microdotblog: { letter: "Mi", cls: "bg-indigo-500 text-white" },
  "bridgy-fed": { letter: "BF", cls: "bg-blue-500 text-white" },
  mobilizon: { letter: "Mo", cls: "bg-sky-500 text-white" },
  loops: { letter: "Lo", cls: "bg-cyan-500 text-white" },
  fedibird: { letter: "Fe", cls: "bg-teal-500 text-white" },
  bookwyrm: { letter: "Bo", cls: "bg-emerald-500 text-white" },
  neodb: { letter: "Ne", cls: "bg-green-500 text-white" },
  sharkey: { letter: "Sh", cls: "bg-lime-500 text-white" },
  hometown: { letter: "Ho", cls: "bg-amber-500 text-white" },
  akkoma: { letter: "Ak", cls: "bg-orange-500 text-white" },
  mbin: { letter: "Mb", cls: "bg-red-500 text-white" },
  foundkey: { letter: "Fo", cls: "bg-rose-500 text-white" },
  wafrn: { letter: "Wa", cls: "bg-pink-500 text-white" },
  "activity-relay": { letter: "AR", cls: "bg-fuchsia-500 text-white" },
  gancio: { letter: "Ga", cls: "bg-purple-500 text-white" },
  cherrypick: { letter: "Ch", cls: "bg-slate-500 text-white" },
  plume: { letter: "Pl", cls: "bg-violet-500 text-white" },
  meisskey: { letter: "Me", cls: "bg-indigo-500 text-white" },
  iceshrimp: { letter: "Ic", cls: "bg-blue-500 text-white" },
  funkwhale: { letter: "Fu", cls: "bg-sky-500 text-white" },
  kmyblue: { letter: "Km", cls: "bg-cyan-500 text-white" },
  bonfire: { letter: "Bo", cls: "bg-teal-500 text-white" },
  hackerspub: { letter: "HP", cls: "bg-emerald-500 text-white" },
  vernissage: { letter: "Ve", cls: "bg-green-500 text-white" },
  emissary: { letter: "Em", cls: "bg-lime-500 text-white" },
  gotosocial: { letter: "Go", cls: "bg-amber-500 text-white" },
  mitra: { letter: "Mi", cls: "bg-orange-500 text-white" },
  takahe: { letter: "Ta", cls: "bg-red-500 text-white" },
  smithereen: { letter: "Sm", cls: "bg-rose-500 text-white" },
  owncast: { letter: "Ow", cls: "bg-pink-500 text-white" },
  manyfold: { letter: "Ma", cls: "bg-fuchsia-500 text-white" },
  lotide: { letter: "Lo", cls: "bg-purple-500 text-white" },
  stegodon: { letter: "St", cls: "bg-slate-500 text-white" },
  snac: { letter: "Sn", cls: "bg-violet-500 text-white" },
  frequency: { letter: "Fr", cls: "bg-indigo-500 text-white" },
};

export interface NetworkBadge {
  label: string;
  cls: string;
  icon: string;
}

// Coarse fallback for when nodeinfo has no answer (unreachable host, or
// software — like Hubzilla itself — that doesn't expose nodeinfo at all).
export function networkBadge(network?: string): NetworkBadge | null {
  if (!network) return null;
  switch (network.toLowerCase()) {
    case "zot6":        return { label: "Hubzilla",    cls: "bg-violet-500/20 text-violet-400", icon: hubzillaIcon };
    case "activitypub": return { label: "ActivityPub", cls: "bg-indigo-500/20 text-indigo-400", icon: activitypubIcon };
    case "rss":          return { label: "RSS",         cls: "bg-orange-500/20 text-orange-400", icon: rssIcon };
    case "diaspora":     return { label: "Diaspora",    cls: "bg-emerald-500/20 text-emerald-400", icon: diasporaIcon };
    default:             return null;
  }
}

function IconChip(props: { src: string; alt: string; size: number }): JSX.Element {
  return (
    <img
      src={props.src}
      alt={props.alt}
      title={props.alt}
      width={props.size}
      height={props.size}
      class="shrink-0 object-contain"
      style={{ width: `${props.size}px`, height: `${props.size}px` }}
    />
  );
}

function Monogram(props: { letter: string; cls: string; size: number; title: string }): JSX.Element {
  return (
    <span
      class={`inline-flex items-center justify-center rounded-full font-bold leading-none shrink-0 ${props.cls}`}
      style={{
        width: `${props.size}px`,
        height: `${props.size}px`,
        "font-size": `${Math.max(6, props.size * 0.5)}px`,
      }}
      title={props.title}
    >
      {props.letter}
    </span>
  );
}

export function platformLabel(software: string): string {
  return software.length <= 3 ? software.toUpperCase() : software[0].toUpperCase() + software.slice(1);
}

export function PlatformIcon(props: { url?: string; network?: string; size?: number }): JSX.Element {
  const software = usePlatformSoftware(() => props.url);
  const name = () => software()?.toLowerCase();
  const iconSrc = () => {
    const n = name();
    return n ? PLATFORM_ICON_SRC[n] : undefined;
  };
  const monogram = () => {
    const n = name();
    return n ? PLATFORM_MONOGRAMS[n] : undefined;
  };
  // No nodeinfo answer at all (unreachable host, or software — like Hubzilla
  // itself — that doesn't expose nodeinfo) falls back to the coarse
  // network badge instead of a misleading "unknown platform" mark.
  const netBadge = () => networkBadge(props.network);

  // Own boundary: a pending nodeinfo lookup suspends the *nearest* Suspense,
  // so without this every new host in an appended page (e.g. the next page of
  // connections) blanks the whole section and the scroll jumps to the top.
  return (
    <Suspense>
    <Show
      when={iconSrc()}
      fallback={
        <Show
          when={monogram()}
          fallback={
            <Show
              when={netBadge()}
              fallback={
                <Show when={name()}>
                  <MdOutlineHelp_outline size={props.size ?? 12} class="text-muted shrink-0" title="Unknown fediverse platform" />
                </Show>
              }
            >
              {(b) => <IconChip src={b().icon} alt={b().label} size={props.size ?? 12} />}
            </Show>
          }
        >
          {(m) => <Monogram letter={m().letter} cls={m().cls} size={props.size ?? 12} title={platformLabel(software()!)} />}
        </Show>
      }
    >
      {(src) => <IconChip src={src()} alt={platformLabel(software()!)} size={props.size ?? 12} />}
    </Show>
    </Suspense>
  );
}
