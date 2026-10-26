'use client';
import { useEffect, useRef, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, LoaderCircle } from 'lucide-react';
export { Button } from '@eimax/shared-ui';

// Portals may belong to different React trees; the last opened dialog owns focus.
const dialogStack: HTMLDivElement[] = [];
function topDialog() {
  return dialogStack[dialogStack.length - 1];
}
function syncDialogs() {
  dialogStack.forEach((dialog, index) => {
    const top = dialog === topDialog();
    dialog.inert = !top;
    dialog.setAttribute('aria-modal', String(top));
    if (top) dialog.removeAttribute('aria-hidden');
    else dialog.setAttribute('aria-hidden', 'true');
    // Match the backdrop token in globals.css, with opening order above DOM order.
    dialog.parentElement!.style.zIndex = String(100 + index);
  });
}
function focusableItems(dialog: HTMLDivElement) {
  return [
    ...dialog.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]',
    ),
  ].filter(
    (item) =>
      item.tabIndex >= 0 &&
      !item.matches(':disabled') &&
      !item.closest('[inert], [hidden]') &&
      item.getClientRects().length > 0 &&
      getComputedStyle(item).visibility !== 'hidden',
  );
}
function focusDialog(dialog: HTMLDivElement) {
  (focusableItems(dialog)[0] ?? dialog).focus();
}
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!mounted) return;
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialogStack.push(dialog);
    // Move focus before hiding the previous dialog from assistive technology.
    focusDialog(dialog);
    syncDialogs();
    const focus = (event: FocusEvent) => {
      if (topDialog() === dialog && !dialog.contains(event.target as Node)) focusDialog(dialog);
    };
    // Guard keys dispatched outside the focus trap as well as normal user focus.
    const key = (event: KeyboardEvent) => {
      if (topDialog() !== dialog || dialog.contains(event.target as Node)) return;
      event.stopPropagation();
      event.preventDefault();
      if (event.key === 'Escape') close.current();
      else focusDialog(dialog);
    };
    document.addEventListener('focusin', focus);
    window.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('focusin', focus);
      window.removeEventListener('keydown', key, true);
      const wasTop = topDialog() === dialog;
      dialogStack.splice(dialogStack.indexOf(dialog), 1);
      syncDialogs();
      if (!wasTop) return;
      const top = topDialog();
      if (previous?.isConnected && !previous.closest('[inert]') && (!top || top.contains(previous)))
        previous.focus();
      else if (top) focusDialog(top);
    };
  }, [mounted]);
  if (!mounted) return null;
  return createPortal(
    <div
      className="dialog-backdrop"
      onKeyDown={(event) => {
        // Keep native editing defaults, but never bubble into editor shortcuts.
        event.stopPropagation();
        if (topDialog() !== ref.current) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          close.current();
        } else if (event.key === 'Tab') {
          const items = focusableItems(ref.current!);
          const first = items[0];
          const last = items[items.length - 1];
          if (
            !first ||
            (event.shiftKey ? document.activeElement === first : document.activeElement === last)
          ) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && topDialog() === ref.current) close.current();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        ref={ref}
        tabIndex={-1}
        className={`dialog ${wide ? 'dialog-wide' : ''}`}
      >
        <div className="dialog-header">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" aria-label="Fechar janela" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        <div className="dialog-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
export function Loading({ message = 'Preparando seu espaço de trabalho…' }: { message?: string }) {
  return (
    <div className="loading-screen" role="status">
      <LoaderCircle className="spin" size={24} />
      <p>{message}</p>
    </div>
  );
}
