import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { buttonClass } from './ui';

/**
 * Modal confirmation ("정말 ...?"). Focus starts on the safe button (cancel), Escape and a click on
 * the backdrop cancel, so doing nothing never destroys anything.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onCancel} data-confirm-backdrop>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        data-confirm-dialog
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-line-soft bg-card p-5 shadow-[var(--shadow-soft)]"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-ink">
          {title}
        </h2>
        <div className="mt-2 text-sm leading-relaxed text-ink-soft">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={buttonClass.secondary} data-confirm-cancel>
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={buttonClass.primary} data-confirm-ok>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
