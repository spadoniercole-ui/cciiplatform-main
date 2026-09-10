'use client';

// Semaforo dell'indicatore sintetico, in testata alla relazione di Screening.
//
// Sostituisce l'etichetta di colore che finiva dentro il testo ("Severità
// CCII: YELLOW"): un dato travestito da parola, per giunta in inglese. Un
// giudizio sintetico va mostrato come tale, non raccontato.
//
// Il componente non calcola nulla: mostra ciò che
// src/lib/screening/indicatore.ts ha determinato. E mostra SEMPRE tre cose —
// il colore, il fattore che lo ha determinato, e la copertura informativa —
// perché un semaforo che non dice perché è acceso obbliga chi legge a
// fidarsi.
//
// I due elenchi "Accertato" e "Da accertare" stanno affiancati e senza
// gerarchia: quale delle due azioni venga prima dipende dalla prassi
// dell'ufficio, e non è una decisione che spetti al software.

import React from 'react';
import { AlertTriangle, CircleCheck, HelpCircle } from 'lucide-react';
import type { Attenzione } from '@/lib/screening/indicatore';

const STILE = {
  ROSSO: {
    pallino: 'bg-red-500',
    riquadro: 'border-red-200 bg-red-50',
    testo: 'text-red-900',
    icona: AlertTriangle,
  },
  GIALLO: {
    pallino: 'bg-amber-400',
    riquadro: 'border-amber-200 bg-amber-50',
    testo: 'text-amber-900',
    icona: HelpCircle,
  },
  ATTENZIONE_MINIMA: {
    pallino: 'bg-emerald-500',
    riquadro: 'border-emerald-200 bg-emerald-50',
    testo: 'text-emerald-900',
    icona: CircleCheck,
  },
} as const;

export function SemaforoAttenzione({ attenzione }: { attenzione: Attenzione }) {
  const s = STILE[attenzione.esito];
  const Icona = s.icona;
  const { determinate, totali } = attenzione.copertura;

  return (
    <div className={`border rounded-xl p-5 space-y-4 ${s.riquadro}`}>
      <div className="flex items-start gap-3">
        {/* Il semaforo vero e proprio: tre luci, una accesa. */}
        <div className="flex flex-col gap-1 pt-0.5 shrink-0">
          {(['ROSSO', 'GIALLO', 'ATTENZIONE_MINIMA'] as const).map((livello) => (
            <span
              key={livello}
              className={`w-3 h-3 rounded-full ${
                attenzione.esito === livello ? STILE[livello].pallino : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        <div className="min-w-0">
          <div className={`flex items-center gap-2 font-bold text-sm ${s.testo}`}>
            <Icona className="w-4 h-4 shrink-0" />
            <span>{attenzione.etichetta}</span>
          </div>
          <p className={`text-[11px] mt-1 ${s.testo} opacity-80`}>
            {attenzione.fattoreDeterminante}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Copertura informativa: {determinate} dimensioni su {totali}
            {determinate < totali && ' — il giudizio è limitato ai dati disponibili'}
          </p>
        </div>
      </div>

      {(attenzione.accertato.length > 0 || attenzione.daAccertare.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-black/5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Accertato
            </p>
            {attenzione.accertato.length === 0 ? (
              <p className="text-[10px] text-slate-400">Nessun elemento accertato.</p>
            ) : (
              <ul className="space-y-1">
                {attenzione.accertato.map((x, i) => (
                  <li key={i} className="text-[10px] text-slate-700 leading-relaxed flex gap-1.5">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Da accertare
            </p>
            {attenzione.daAccertare.length === 0 ? (
              <p className="text-[10px] text-slate-400">Nulla da integrare.</p>
            ) : (
              <ul className="space-y-1">
                {attenzione.daAccertare.map((x, i) => (
                  <li key={i} className="text-[10px] text-slate-700 leading-relaxed flex gap-1.5">
                    <span className="text-slate-400 shrink-0">—</span>
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-relaxed pt-2 border-t border-black/5">
        Indicatore di <span className="font-bold">priorità di attenzione</span>, non di probabilità
        di insolvenza: le aziende in esame provengono già da una selezione. I due elenchi non sono
        in ordine di priorità — la scelta su come procedere resta al valutatore.
      </p>
    </div>
  );
}
