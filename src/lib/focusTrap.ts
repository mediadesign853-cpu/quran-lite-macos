const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Keep keyboard focus inside an open modal drawer and restore it when the drawer closes. */
export function trapFocus(dialog: HTMLElement, initialFocus?: HTMLElement | null): () => void {
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => !element.hasAttribute('hidden') && !element.closest('[inert]'));

  (initialFocus ?? focusable()[0] ?? dialog).focus();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const elements = focusable();
    if (elements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  };

  dialog.addEventListener('keydown', onKeyDown);
  return () => {
    dialog.removeEventListener('keydown', onKeyDown);
    previousFocus?.focus();
  };
}
