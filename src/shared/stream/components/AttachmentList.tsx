import { createSignal, For, Show } from "solid-js";
import type { StreamAttachment } from "@utsukta/spa-core/types/post.types";
import { classifyPreview } from "@utsukta/spa-core/lib/filePreview";
import FilePreviewModal from "@/shared/views/FilePreviewModal";

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

function formatBytes(raw: string): string {
  const n = parseInt(raw, 10);
  if (!n || isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// item.attach href is "/attach/hash" (served as download, not inline).
// Photos are also in the photo table as resource_id = hash, served inline at
// /photo/{hash}-2. Try that URL for display; fall back to a file chip.
// No extension: core serves whatever variant it stored and sets the
// Content-type itself, so guessing one off the mimetype only ever produced
// 404s for anything it re-encoded on upload (avif/heic).
function photoDisplayUrl(href: string): string {
  const hash = href.split("/attach/").pop() ?? href.split("/").pop() ?? "";
  return `/photo/${hash}-2`;
}

export default function AttachmentList(props: { attachments: StreamAttachment[]; compact?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [previewing, setPreviewing] = createSignal<StreamAttachment | null>(null);

  const images = () => props.attachments.filter((a) => a.type.startsWith("image/"));
  const links  = () => props.attachments.filter((a) => a.type.startsWith("text/html"));
  const files  = () => props.attachments.filter((a) => !a.type.startsWith("image/") && !a.type.startsWith("text/html"));

  const label = () => {
    const img = images().length;
    const lnk = links().length;
    const fil = files().length;
    const parts: string[] = [];
    if (img > 0) parts.push(`${img} image${img !== 1 ? "s" : ""}`);
    if (lnk > 0) parts.push(`${lnk} link${lnk !== 1 ? "s" : ""}`);
    if (fil > 0) parts.push(`${fil} file${fil !== 1 ? "s" : ""}`);
    return parts.join(", ");
  };

  return (
    <div class="mt-2">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-rim bg-elevated
               text-xs text-muted hover:text-txt hover:bg-overlay transition-colors"
      >
        <PaperclipIcon />
        <span>{label()}</span>
        <ChevronIcon open={open()} />
      </button>

      {/* Dropdown content */}
      <Show when={open()}>
        <div class="mt-2 flex flex-col gap-2">
          <Show when={images().length > 0}>
            <div
              class={
                "grid gap-2 " +
                (images().length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3")
              }
            >
              <For each={images()}>
                {(img) => <ImageChip img={img} compact={props.compact} />}
              </For>
            </div>
          </Show>

          <Show when={links().length > 0}>
            <div class="flex flex-col gap-1.5">
              <For each={links()}>
                {(link) => <LinkChip link={link} />}
              </For>
            </div>
          </Show>

          <Show when={files().length > 0}>
            <div class="flex flex-wrap gap-2">
              <For each={files()}>
                {(file) => {
                  const previewable = () =>
                    classifyPreview(file.type, safeDecode(file.title)) !== "none";
                  const chip = (
                    <>
                      <FileIcon type={file.type} />
                      <div class="min-w-0">
                        <div class="truncate text-xs font-medium">
                          {safeDecode(file.title) || "File"}
                        </div>
                        <Show when={file.length && file.length !== "0"}>
                          <div class="text-[0.625rem] text-muted">{formatBytes(file.length)}</div>
                        </Show>
                      </div>
                    </>
                  );
                  return (
                    <Show
                      when={previewable()}
                      fallback={
                        <a
                          href={file.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="flex items-center gap-2 px-3 py-2 rounded-lg border border-rim bg-elevated
                                 hover:bg-overlay text-txt transition-colors max-w-xs"
                        >
                          {chip}
                        </a>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewing(file)}
                        class="flex items-center gap-2 px-3 py-2 rounded-lg border border-rim bg-elevated
                               hover:bg-overlay text-txt transition-colors max-w-xs text-left"
                      >
                        {chip}
                      </button>
                    </Show>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={previewing()}>
        {(file) => (
          <FilePreviewModal
            url={file().href}
            filename={safeDecode(file().title) || "File"}
            mimetype={file().type}
            sizeBytes={parseInt(file().length, 10) || undefined}
            onClose={() => setPreviewing(null)}
          />
        )}
      </Show>
    </div>
  );
}

function LinkChip(props: { link: StreamAttachment }) {
  const displayTitle = () => {
    const t = safeDecode(props.link.title).trim();
    if (t) return t;
    try {
      return new URL(props.link.href).hostname;
    } catch {
      return props.link.href;
    }
  };

  const hostname = () => {
    try { return new URL(props.link.href).hostname; } catch { return ""; }
  };

  return (
    <a
      href={props.link.href}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-2 px-3 py-2 rounded-lg border border-rim bg-elevated
             hover:bg-overlay text-txt transition-colors"
    >
      <LinkIcon />
      <div class="min-w-0 flex-1">
        <div class="truncate text-xs font-medium">{displayTitle()}</div>
        <Show when={hostname()}>
          <div class="text-[0.625rem] text-muted truncate">{hostname()}</div>
        </Show>
      </div>
    </a>
  );
}

function ImageChip(props: { img: StreamAttachment; compact?: boolean }) {
  const [failed, setFailed] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  const displayUrl = photoDisplayUrl(props.img.href);
  const filename = () => safeDecode(props.img.title) || "Image";

  return (
    <>
      <Show
        when={!failed()}
        fallback={
          <a
            href={props.img.href}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center gap-2 px-3 py-2 rounded-lg border border-rim bg-elevated
                   hover:bg-overlay text-txt transition-colors"
          >
            <FileIcon type={props.img.type} />
            <div class="min-w-0">
              <div class="truncate text-xs font-medium">{filename()}</div>
              <Show when={props.img.length && props.img.length !== "0"}>
                <div class="text-[0.625rem] text-muted">{formatBytes(props.img.length)}</div>
              </Show>
            </div>
          </a>
        }
      >
        <button type="button" onClick={() => setOpen(true)} class="block w-full">
          <img
            src={displayUrl}
            alt={filename()}
            onError={() => setFailed(true)}
            class={
              "w-full rounded-lg object-cover hover:opacity-90 transition-opacity " +
              (props.compact ? "max-h-40" : "max-h-72")
            }
            loading="lazy"
          />
        </button>
      </Show>

      <Show when={open()}>
        <FilePreviewModal
          url={displayUrl}
          filename={filename()}
          mimetype={props.img.type}
          sizeBytes={parseInt(props.img.length, 10) || undefined}
          onClose={() => setOpen(false)}
        />
      </Show>
    </>
  );
}

function PaperclipIcon() {
  return (
    <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
      />
    </svg>
  );
}

function ChevronIcon(props: { open: boolean }) {
  return (
    <svg
      class={`w-3 h-3 shrink-0 transition-transform ${props.open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg class="w-4 h-4 shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

function FileIcon(props: { type: string }) {
  const color = () => {
    const t = props.type;
    if (t === "application/pdf") return "text-red-400";
    if (t.includes("word") || t.includes("document")) return "text-blue-400";
    if (t.includes("sheet") || t.includes("excel") || t.includes("csv")) return "text-green-400";
    if (t.includes("zip") || t.includes("tar") || t.includes("compressed")) return "text-yellow-400";
    if (t.startsWith("audio/")) return "text-purple-400";
    if (t.startsWith("video/")) return "text-pink-400";
    if (t.startsWith("image/")) return "text-blue-300";
    return "text-muted";
  };

  return (
    <svg class={`w-5 h-5 shrink-0 ${color()}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}
