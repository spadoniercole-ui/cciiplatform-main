// src/components/brand/Logo.tsx
//
// "Misuriamo il battito del tuo business" — il logo è un tracciato di
// elettrocardiogramma dentro un cerchio Blu Analisi, con un anello
// esterno sottile a fare da alone. Due varianti: `icon` (solo il
// cerchio, per sidebar strette o favicon-like), `full` (icona +
// wordmark, per intestazioni e schermate di ingresso).

import React from 'react';

interface LogoProps {
  variante?: 'icon' | 'full';
  dimensione?: number; // lato del cerchio in px, per la variante icon
  className?: string;
}

export function Logo({ variante = 'icon', dimensione = 32, className = '' }: LogoProps) {
  const icona = (
    <svg
      viewBox="0 0 100 100"
      width={dimensione}
      height={dimensione}
      className="shrink-0"
      role="img"
      aria-label="CCIIWEB4.0"
    >
      <circle
        cx="50"
        cy="50"
        r="48"
        fill="none"
        stroke="oklch(0.55 0.14 220 / 0.25)"
        strokeWidth="2"
      />
      <circle cx="50" cy="50" r="40" fill="oklch(0.55 0.14 220)" />
      <path
        d="M 22 50 L 38 50 L 45 30 L 55 68 L 62 50 L 78 50"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variante === 'icon') {
    return <span className={className}>{icona}</span>;
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {icona}
      <div className="leading-tight">
        <div className="font-bold tracking-tight" style={{ fontSize: dimensione * 0.5 }}>
          <span style={{ color: 'oklch(0.25 0.02 250)' }}>CCIIWEB</span>
          <span style={{ color: 'oklch(0.55 0.14 220)' }}>4.0</span>
        </div>
      </div>
    </div>
  );
}
