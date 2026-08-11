import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-slate-200 rounded-md ${className}`} />;
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={`skel-row-${rowIdx + 1}`}
          className="flex items-center gap-4 px-4 py-3 border-b border-slate-100"
        >
          {Array.from({ length: cols }).map((_, colIdx) => (
            <Skeleton
              key={`skel-cell-${rowIdx + 1}-${colIdx + 1}`}
              className={`h-4 ${colIdx === 0 ? 'w-32' : colIdx === cols - 1 ? 'w-16' : 'flex-1'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}

/** La firma del brand (il tracciato ECG del logo) come indicatore di
 * caricamento — non il generico spinner circolare o il testo
 * "Caricamento..." nudo che ricorre in decine di punti dell'app.
 * Piccolo abbastanza da stare inline accanto a un&apos;etichetta,
 * grande abbastanza da essere lo stato di caricamento di una pagina
 * intera con `taglia="pagina"`. */
export function CaricamentoBattito({
  etichetta = 'Caricamento...',
  taglia = 'inline',
}: {
  etichetta?: string;
  taglia?: 'inline' | 'pagina';
}) {
  const dimensione = taglia === 'pagina' ? 28 : 16;
  return (
    <div
      className={`flex items-center gap-2 ${taglia === 'pagina' ? 'justify-center py-10' : ''}`}
      role="status"
      aria-live="polite"
    >
      <svg
        viewBox="0 0 100 40"
        width={dimensione * 2.5}
        height={dimensione}
        className="shrink-0 text-blue-600"
        aria-hidden="true"
      >
        <path
          d="M 0 20 L 28 20 L 36 6 L 48 34 L 58 20 L 100 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="12 8"
          className="animate-battito"
        />
      </svg>
      {etichetta && (
        <span className="text-xs text-slate-400" aria-hidden="true">
          {etichetta}
        </span>
      )}
      <span className="sr-only">{etichetta || 'Caricamento in corso'}</span>
    </div>
  );
}
