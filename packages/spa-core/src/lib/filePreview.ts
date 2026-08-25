export type PreviewKind = "pdf" | "epub" | "video" | "audio" | "image" | "excalidraw" | "markdown" | "text" | "none";

const TEXT_EXT = /\.(txt|md|markdown|json|ya?ml|xml|csv|log|ini|conf|sh|bash|js|ts|tsx|jsx|py|php|java|c|cpp|h|hpp|cs|go|rs|rb|css|scss|html?)$/i;
const MD_EXT = /\.(md|markdown)$/i;
const PDF_EXT = /\.pdf$/i;
const EPUB_EXT = /\.epub$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|wmv|flv|m4v|3gp|ts|mts|m2ts|ogv)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|wma|weba)$/i;
const EXCALIDRAW_EXT = /\.excalidraw$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i;

/**
 * Classify a file for inline preview purposes. Prefers mimetype, but falls
 * back to filename extension — attach records don't always carry a precise
 * filetype (e.g. generic "application/octet-stream"), and without a
 * fallback those files would silently stay download-only.
 */
export function classifyPreview(mimetype: string, filename: string): PreviewKind {
  const mime = (mimetype || "").toLowerCase();
  if (mime === "application/pdf" || PDF_EXT.test(filename)) return "pdf";
  if (mime === "application/epub+zip" || EPUB_EXT.test(filename)) return "epub";
  // Extension only — scenes are stored as generic application/json.
  if (EXCALIDRAW_EXT.test(filename)) return "excalidraw";
  if (mime.startsWith("video/") || VIDEO_EXT.test(filename)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXT.test(filename)) return "audio";
  if (mime.startsWith("image/") || IMAGE_EXT.test(filename)) return "image";
  if (mime === "text/markdown" || MD_EXT.test(filename)) return "markdown";
  if (mime.startsWith("text/") || TEXT_EXT.test(filename)) return "text";
  return "none";
}

// ponytail: hardcoded cap so a huge log/text file doesn't get fetched into a
// string and freeze the tab; raise or make configurable if a real case needs
// bigger inline previews.
export const TEXT_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
