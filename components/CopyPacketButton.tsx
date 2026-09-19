'use client';

import { useState } from 'react';

export function CopyPacketButton({ payload }: { payload: unknown }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="text-btn packet-copy" onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy JSON'}
    </button>
  );
}
