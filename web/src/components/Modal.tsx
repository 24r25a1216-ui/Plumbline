import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Field } from './ui';

export function Modal({
  open, onClose, title, eyebrow, children, footer, wide, dismissable = true,
}: {
  open: boolean; onClose: () => void; title: ReactNode; eyebrow?: string; children: ReactNode; footer?: ReactNode; wide?: boolean; dismissable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>('input, textarea, select, button.btn-primary, button.btn-danger-solid')?.focus(), 30);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose()}>
      <div ref={ref} className={`modal reg${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head row between">
          <div className="col gap-6">
            {eyebrow && <span className="label">{eyebrow}</span>}
            <h2 className="h2">{title}</h2>
          </div>
          {dismissable && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirm dialog with three friction tiers:
 *  - plain confirm, - with a required reason, - type-to-confirm for irreversible actions.
 */
export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger, reason, reasonLabel = 'Reason', reasonMin = 0, reasonPlaceholder, typeToConfirm, busy,
}: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void | Promise<void>; title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean;
  reason?: boolean; reasonLabel?: string; reasonMin?: number; reasonPlaceholder?: string; typeToConfirm?: string; busy?: boolean;
}) {
  const [text, setText] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) { setText(''); setTyped(''); }
  }, [open]);
  const reasonOk = !reason || text.trim().length >= reasonMin;
  const typedOk = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow={danger ? 'Confirm · irreversible' : 'Confirm'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`} disabled={!reasonOk || !typedOk || busy} onClick={() => onConfirm(text.trim())}>
            {busy && <span className="spinner" />} {confirmLabel}
          </button>
        </>
      }
    >
      <div className="col gap-16">
        {body && <div className="ink2" style={{ fontSize: 14 }}>{body}</div>}
        {reason && (
          <Field label={reasonLabel} hint={reasonMin ? `At least ${reasonMin} characters.` : undefined}>
            <textarea className="textarea" style={{ minHeight: 90 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={reasonPlaceholder} />
          </Field>
        )}
        {typeToConfirm && (
          <Field label={<>Type <span className="mono accent">{typeToConfirm}</span> to confirm</>}>
            <input className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </div>
    </Modal>
  );
}
