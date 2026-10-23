import { useEffect } from 'react';

/**
 * A toast on the session bar.
 *
 * Fades in, auto-dismisses in 4s, max 3 stacked. Clicking opens the report.
 */

export interface ToastItem {
  readonly id: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function ToastStack({ items, onDismiss }: { items: readonly ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), 4000);
    return () => window.clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div className="toast">
      <span className="toast__message">{item.message}</span>
      {item.onAction !== undefined && (
        <button className="toast__action" type="button" onClick={item.onAction}>
          {item.actionLabel ?? 'Open report'}
        </button>
      )}
      <button className="toast__dismiss" type="button" aria-label="Dismiss" onClick={() => onDismiss(item.id)}>
        ×
      </button>
    </div>
  );
}
