'use client';

// Finestre dell'applicativo al posto di alert() e confirm() del browser.
//
// Regola fissata da Ercole (0.109.86): mai avvisi nativi, che mostrano
// l'intestazione tecnica del browser («… vercel.app dice») e non possono
// indicare la strada. Da qui: `avvisoApp(testo)` e `await confermaApp(testo)`
// hanno la stessa forma delle funzioni native, cosi' sostituirle nei
// componenti e' un cambio di una riga. Il componente <FinestreApp/> e'
// montato una volta nel layout radice e ascolta un evento del browser.

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';

const EVENTO = 'ccii:finestra';

interface Richiesta {
  tipo: 'avviso' | 'conferma';
  titolo?: string;
  testo: string;
  /** Etichetta del pulsante che conferma (default «Conferma»). */
  etichettaConferma?: string;
  /** L'azione confermata e' distruttiva: pulsante rosso. */
  distruttiva?: boolean;
  risolvi: (esito: boolean) => void;
}

function invia(r: Omit<Richiesta, 'risolvi'>): Promise<boolean> {
  return new Promise((risolvi) => {
    if (typeof window === 'undefined') return risolvi(false);
    window.dispatchEvent(new CustomEvent<Richiesta>(EVENTO, { detail: { ...r, risolvi } }));
  });
}

/** Avviso con un solo pulsante. Non blocca: si risolve alla chiusura. */
export function avvisoApp(testo: string, titolo?: string): Promise<boolean> {
  return invia({ tipo: 'avviso', testo, titolo });
}

/** Conferma: true se l'utente conferma, false se annulla. */
export function confermaApp(
  testo: string,
  opzioni: { titolo?: string; etichettaConferma?: string; distruttiva?: boolean } = {}
): Promise<boolean> {
  return invia({ tipo: 'conferma', testo, ...opzioni });
}

export function FinestreApp() {
  const [coda, setCoda] = useState<Richiesta[]>([]);
  useEffect(() => {
    const ascolta = (e: Event) => setCoda((c) => [...c, (e as CustomEvent<Richiesta>).detail]);
    window.addEventListener(EVENTO, ascolta);
    return () => window.removeEventListener(EVENTO, ascolta);
  }, []);
  const corrente = coda[0];
  if (!corrente) return null;

  const chiudi = (esito: boolean) => {
    corrente.risolvi(esito);
    setCoda((c) => c.slice(1));
  };
  const distruttiva = corrente.tipo === 'conferma' && corrente.distruttiva;

  return (
    <div
      role={corrente.tipo === 'conferma' ? 'alertdialog' : 'dialog'}
      aria-modal="true"
      aria-label={corrente.titolo ?? (corrente.tipo === 'conferma' ? 'Conferma' : 'Avviso')}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') chiudi(false);
      }}
    >
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-3">
        <div className="flex items-center gap-2">
          {distruttiva ? (
            <AlertTriangle className="w-5 h-5 text-red-600" />
          ) : (
            <Info className="w-5 h-5 text-blue-600" />
          )}
          <h4 className="font-bold text-slate-900 text-sm">
            {corrente.titolo ?? (corrente.tipo === 'conferma' ? 'Conferma' : 'Avviso')}
          </h4>
        </div>
        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
          {corrente.testo}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          {corrente.tipo === 'conferma' && (
            <button
              type="button"
              onClick={() => chiudi(false)}
              className="px-3 py-2 text-[10px] font-bold uppercase text-slate-600 hover:text-slate-900"
            >
              Annulla
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => chiudi(true)}
            className={`px-3 py-2 text-white text-[10px] font-bold uppercase rounded-lg ${distruttiva ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {corrente.tipo === 'conferma' ? (corrente.etichettaConferma ?? 'Conferma') : 'Ok'}
          </button>
        </div>
      </div>
    </div>
  );
}
