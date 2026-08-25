'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import {
  segmentaConNormativa,
  linkNormativaArticolo,
  RIFERIMENTI_SCREENING,
} from '@/lib/normativa/riferimenti';

interface Props {
  testo: string;
  codice: string;
  /** Se true, mostra sotto al testo la barra dei riferimenti pertinenti. */
  mostraRiferimenti?: boolean;
  className?: string;
}

/**
 * Rende un testo di report preservando gli a-capo (pre-wrap) e trasformando
 * le citazioni di articoli noti (es. «art. 25-novies») in link alla Normativa.
 * Il testo non viene alterato: solo le porzioni riconosciute diventano link.
 */
export function TestoConNormativa({
  testo,
  codice,
  mostraRiferimenti = false,
  className = 'text-xs text-slate-700 whitespace-pre-wrap leading-relaxed',
}: Props) {
  const segmenti = segmentaConNormativa(testo);

  return (
    <div>
      <div className={className}>
        {segmenti.map((s, i) =>
          s.tipo === 'link' && s.numero ? (
            <Link
              key={i}
              href={linkNormativaArticolo(codice, s.numero)}
              className="text-blue-600 font-semibold underline decoration-blue-200 hover:decoration-blue-500"
              title={`Apri la Normativa sull'art. ${s.numero}`}
            >
              {s.valore}
            </Link>
          ) : (
            <React.Fragment key={i}>{s.valore}</React.Fragment>
          )
        )}
      </div>

      {mostraRiferimenti && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            <BookOpen className="w-3.5 h-3.5" /> Riferimenti normativi
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RIFERIMENTI_SCREENING.map((r) => (
              <Link
                key={r.numero}
                href={linkNormativaArticolo(codice, r.numero)}
                className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1 hover:bg-blue-100 transition-colors"
                title={r.etichetta}
              >
                Art. {r.numero} · {r.etichetta}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
