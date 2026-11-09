// Attachments (m.image / m.video / m.audio / m.file / m.sticker) and mxc
// avatars. Signals rather than createResource: a resource read here would
// suspend the whole Messenger pane through the lazy-tab <Suspense>.
import { Show, Switch, Match, createSignal, type JSX } from "solid-js";
import { useI18n } from "@utsukta/spa-core/i18n";
import { Avatar } from "@ui/Avatar";
import { Spinner } from "@ui/Spinner";
import { MdOutlineDownload, MdOutlinePlay_circle, MdOutlineBroken_image } from "solid-icons/md";
import { mediaUrl, type MediaSource } from "./media";

type Info = {
  mimetype?: string; w?: number; h?: number; size?: number;
  thumbnail_url?: string; thumbnail_file?: MediaSource["file"]; thumbnail_info?: { mimetype?: string };
};
type Content = { msgtype?: string; body?: string; filename?: string; url?: string; file?: MediaSource["file"]; info?: Info };

/** Resolve once; `undefined` while loading, `null` on failure. */
function useUrl(get: () => Promise<string>) {
  const [url, setUrl] = createSignal<string | null | undefined>(undefined);
  get().then(setUrl, () => setUrl(null));
  return url;
}

const src = (c: Content): MediaSource => ({ url: c.url, file: c.file });
const sizeLabel = (n?: number) =>
  !n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Preview-size image: server thumbnail when unencrypted, else the sender's thumbnail, else the file. */
function previewUrl(c: Content): Promise<string> {
  const i = c.info ?? {};
  if (i.thumbnail_file) return mediaUrl({ file: i.thumbnail_file }, i.thumbnail_info?.mimetype ?? "image/jpeg");
  if (c.file) return mediaUrl(src(c), i.mimetype);
  return mediaUrl(src(c), i.mimetype, { w: 800, h: 600 });
}

const failed = (name: string) => (
  <span class="inline-flex items-center gap-1.5 text-muted italic"><MdOutlineBroken_image size={16} />{name}</span>
);

function Img(props: { c: Content; sticker?: boolean }) {
  const url = useUrl(() => previewUrl(props.c));
  const w = props.c.info?.w, h = props.c.info?.h;
  const box = props.sticker ? "max-h-32" : "max-h-80";
  return (
    <Show when={url() !== null} fallback={failed(props.c.body ?? "")}>
      <Show
        when={url()}
        fallback={<div class={`bg-elevated rounded-xl ${box} w-60 max-w-full animate-pulse`} style={{ "aspect-ratio": w && h ? `${w} / ${h}` : "4 / 3" }} />}
      >
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); void mediaUrl(src(props.c), props.c.info?.mimetype).then((u) => window.open(u, "_blank", "noopener")); }}
        >
          <img src={url()!} alt={props.c.body ?? ""} class={`rounded-xl ${box} max-w-full w-auto object-contain`} loading="lazy" />
        </a>
      </Show>
    </Show>
  );
}

/** Video: poster first, the (possibly large) file only on click. */
function Video(props: { c: Content }) {
  const { t } = useI18n();
  const i = props.c.info ?? {};
  const poster = useUrl(() =>
    i.thumbnail_file || i.thumbnail_url
      ? mediaUrl(i.thumbnail_file ? { file: i.thumbnail_file } : { url: i.thumbnail_url }, i.thumbnail_info?.mimetype ?? "image/jpeg")
      : Promise.reject(new Error("no poster")));
  const [play, setPlay] = createSignal<string | null | undefined>();
  const [loading, setLoading] = createSignal(false);
  const load = () => {
    setLoading(true);
    mediaUrl(src(props.c), i.mimetype).then(setPlay, () => setPlay(null)).finally(() => setLoading(false));
  };
  return (
    <Switch>
      <Match when={play() === null}>{failed(props.c.body ?? "")}</Match>
      <Match when={play()}>
        <video src={play()!} controls autoplay class="rounded-xl max-h-80 max-w-full" />
      </Match>
      <Match when={true}>
        <button
          type="button"
          onClick={load}
          class="relative flex items-center justify-center rounded-xl bg-elevated overflow-hidden w-64 max-w-full"
          style={{ "aspect-ratio": i.w && i.h ? `${i.w} / ${i.h}` : "16 / 9" }}
          aria-label={t("matrix.play", { name: props.c.body ?? "" }) as string}
        >
          <Show when={poster()}><img src={poster()!} alt="" class="absolute inset-0 w-full h-full object-cover" /></Show>
          <span class="relative text-white drop-shadow">
            {loading() ? <Spinner /> : <MdOutlinePlay_circle size={48} />}
          </span>
          <Show when={i.size}>
            <span class="absolute bottom-1 right-2 text-[0.625rem] text-white drop-shadow">{sizeLabel(i.size)}</span>
          </Show>
        </button>
      </Match>
    </Switch>
  );
}

function Audio(props: { c: Content }) {
  const url = useUrl(() => mediaUrl(src(props.c), props.c.info?.mimetype));
  return (
    <Show when={url() !== null} fallback={failed(props.c.body ?? "")}>
      <Show when={url()} fallback={<Spinner size="sm" />}>
        <audio src={url()!} controls preload="metadata" class="max-w-full" />
      </Show>
    </Show>
  );
}

function FileLink(props: { c: Content }) {
  const { t } = useI18n();
  const [busy, setBusy] = createSignal(false);
  const name = () => props.c.filename ?? props.c.body ?? "file";
  // Always saved, never opened: a non-media type is application/octet-stream.
  async function download() {
    setBusy(true);
    try {
      const a = document.createElement("a");
      a.href = await mediaUrl(src(props.c), props.c.info?.mimetype);
      a.download = name();
      a.click();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={() => void download()} disabled={busy()}
      class="inline-flex items-center gap-2 text-left hover:underline disabled:opacity-50"
      aria-label={t("matrix.download", { name: name() }) as string}>
      {busy() ? <Spinner size="sm" /> : <MdOutlineDownload size={18} class="shrink-0" />}
      <span class="min-w-0 break-all">{name()}</span>
      <Show when={props.c.info?.size}><span class="text-xs text-muted shrink-0">{sizeLabel(props.c.info!.size)}</span></Show>
    </button>
  );
}

/** Renders a media message; null when `type` isn't one. */
export function MatrixAttachment(props: { type: string; content: Content }): JSX.Element {
  return (
    <Switch>
      <Match when={props.type === "m.sticker"}><Img c={props.content} sticker /></Match>
      <Match when={props.content.msgtype === "m.image"}><Img c={props.content} /></Match>
      <Match when={props.content.msgtype === "m.video"}><Video c={props.content} /></Match>
      <Match when={props.content.msgtype === "m.audio"}><Audio c={props.content} /></Match>
      <Match when={props.content.msgtype === "m.file"}><FileLink c={props.content} /></Match>
    </Switch>
  );
}

export const isAttachment = (type: string, msgtype: unknown) =>
  type === "m.sticker" || ["m.image", "m.video", "m.audio", "m.file"].includes(String(msgtype));

/** Room/space avatar from an mxc url, falling back to initials. */
export function MxcAvatar(props: { mxc?: string | null; name: string; size: number; class?: string }) {
  const px = props.size * 4 * 2; // tailwind units → px, ×2 for hidpi
  const url = useUrl(() => (props.mxc ? mediaUrl({ url: props.mxc }, undefined, { w: px, h: px }) : Promise.reject(new Error("none"))));
  return <Avatar src={url() ?? undefined} name={props.name} size={props.size} class={props.class} />;
}
