import { createEffect, onCleanup } from 'solid-js';

// Images wrapped in a link to something other than a photo/image keep their
// link (banner → website). Hubzilla photo posts link to /photos/…/image/….
const IMAGE_LINK = /\/photos?\/|\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;
// Hubzilla photo URLs carry a size suffix (-1/-2/-3); -0 is the original.
const HZ_PHOTO = /(\/photo\/[^/?#]+)-[1-3](\.[a-z]+)?(?=[?#]|$)/i;
const MIN_SIZE = 64; // skip emoji, smilies, avatars

function eligible(img: HTMLImageElement): boolean {
  if (!img.complete || img.dataset.nsfwSrc) return false;
  if (img.naturalWidth < MIN_SIZE || img.naturalHeight < MIN_SIZE) return false;
  if (img.closest('.share-avatar')) return false;
  const a = img.closest('a');
  return !a || IMAGE_LINK.test(a.href);
}

/**
 * Click any image inside `ref` to open it in a zoomable PhotoSwipe lightbox,
 * paging through the other images in the same body. Delegated, so it covers
 * whatever innerHTML the body is re-rendered with.
 */
export function useLightbox(ref: () => HTMLElement | undefined) {
  createEffect(() => {
    const el = ref();
    if (!el) return;
    el.classList.add('hz-lightbox');

    const onClick = async (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target;
      if (!(target instanceof HTMLImageElement) || !eligible(target)) return;
      e.preventDefault();
      e.stopPropagation();

      const imgs = Array.from(el.querySelectorAll('img')).filter(eligible);
      const items = imgs.map(img => ({
        src: img.currentSrc.replace(HZ_PHOTO, '$1-0$2'),
        msrc: img.currentSrc,
        alt: img.alt,
        // Same aspect as the original; real size is patched in on load.
        width: img.naturalWidth,
        height: img.naturalHeight,
      }));

      const [{ default: PhotoSwipe }] = await Promise.all([
        import('photoswipe'),
        import('photoswipe/style.css'),
      ]);
      // Inside a modal <dialog> (top layer, rest of the page inert) the
      // lightbox must live in the dialog, and its Escape must not also fire
      // the dialog's `cancel` and close the modal underneath. A non-modal one
      // (a docked post) is just a small box on the page — stay on <body>.
      const host = el.closest('dialog');
      const dialog = host?.matches(':modal') ? host : undefined;
      const keepDialog = (ev: Event) => ev.preventDefault();
      const pswp = new PhotoSwipe({
        dataSource: items,
        index: imgs.indexOf(target),
        bgOpacity: 0.95,
        wheelToZoom: true,
        appendToEl: dialog,
      });
      // A mouse click on the background already closes (bgClickAction); a
      // touch tap only toggles the controls. Make a tap off the image close too.
      pswp.on('tapAction', (e) => {
        if ((e.originalEvent.target as Element).classList.contains('pswp__img')) return;
        e.preventDefault();
        pswp.close();
      });
      if (dialog) {
        dialog.addEventListener('cancel', keepDialog);
        pswp.on('destroy', () => dialog.removeEventListener('cancel', keepDialog));
      }
      // The full-size image is larger than the thumbnail we measured; feed its
      // real dimensions back so zoom levels go up to 1:1 of the original.
      pswp.on('loadComplete', ({ slide, content }) => {
        const img = content.element;
        if (!(img instanceof HTMLImageElement) || !img.naturalWidth) return;
        const item = items[content.index];
        item.width = img.naturalWidth;
        item.height = img.naturalHeight;
        Object.assign(content, { width: item.width, height: item.height });
        Object.assign(slide, { width: item.width, height: item.height });
        slide.calculateSize();
        slide.updateContentSize(true);
        slide.zoomTo(slide.zoomLevels.initial, undefined, 0);
      });
      pswp.init();
    };

    el.addEventListener('click', onClick);
    onCleanup(() => el.removeEventListener('click', onClick));
  });
}
