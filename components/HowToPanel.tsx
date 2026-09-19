'use client';

import { useEffect } from 'react';
import { HOW_TO_COPY } from '@/lib/how-to-copy';

export function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 10.6v5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7.7" r="1.05" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HowToOpenButton({
  className,
  onClick,
}: {
  className: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={className} aria-label={HOW_TO_COPY.openLabel} onClick={onClick}>
      <InfoIcon />
    </button>
  );
}

export function HowToOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="info-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="info-card">
        <div className="info-card-head">
          <div>
            <p className="analysis-kicker">{HOW_TO_COPY.openLabel}</p>
            <h2 id="info-title" className="leave-title">
              {HOW_TO_COPY.title}
            </h2>
          </div>
          <button
            type="button"
            className="info-close"
            aria-label={HOW_TO_COPY.closeLabel}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <p className="leave-copy">{HOW_TO_COPY.what}</p>
        <ol className="info-steps">
          {HOW_TO_COPY.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="info-note">{HOW_TO_COPY.mapHint}</p>
        <p className="info-note">{HOW_TO_COPY.demo}</p>
        <p className="info-emergency">{HOW_TO_COPY.emergency}</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
          {HOW_TO_COPY.doneLabel}
        </button>
      </div>
    </div>
  );
}
