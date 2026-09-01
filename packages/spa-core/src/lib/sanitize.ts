// core/utils/sanitize.ts
import DOMPurify from 'dompurify';
import { emojify } from './emojify';
import { shortenUrls } from './shortenUrls';
import { getEmojiMap } from '../store/emoji-store';
import { useEmojiAsImages } from '../store/emoji-as-images';

export function sanitizeHtml(html: string): string {
  const emojified = useEmojiAsImages()() ? emojify(html, getEmojiMap()) : html;
  return DOMPurify.sanitize(shortenUrls(emojified), {
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'u', 's', 'em', 'strong',
      'p', 'br', 'div', 'span', 'blockquote',
      'pre', 'code', 'img', 'details', 'summary',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'video', 'audio', 'source',
      'button', 'svg', 'path',
      // Presentational only, no interaction and no script surface. Without
      // them [table], [s] and [hr] were silently dropped from every post —
      // bbcode.ts renders them as <table>/<del>/<hr> (bbcode.ts:1031, :899,
      // :1046), and markdown items produce the same tags via marked.
      // Deliberately NOT here: <input>, which [checklist] emits. Allowing it
      // would let federated content draw form controls, so checklists render
      // as a plain list until that is decided on its own merits.
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
      'del', 'hr',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'rel',
      'align', 'colspan', 'rowspan', 'scope',
      'class', 'style', 'target',
      'controls', 'preload', 'poster', 'type',
      'data-plyr-provider', 'data-plyr-embed-id',
      'loading',
      'data-crypt-payload',
      'hidden', 'data-nsfw-toggle', 'data-nsfw-src',
      'viewBox', 'fill', 'stroke', 'stroke-width',
      'stroke-linecap', 'stroke-linejoin', 'd', 'aria-hidden',
    ],
    ALLOW_DATA_ATTR: false,
  });
}
