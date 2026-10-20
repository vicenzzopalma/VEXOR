
'use client';
import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X, LoaderCircle } from 'lucide-react';
export { Button } from '@eimax/shared-ui';
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
  const id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, textarea, a[href], [tabindex="0"]',
      ) ?? []),
    ];
    focusables()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        ref={ref}
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
    </div>
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
