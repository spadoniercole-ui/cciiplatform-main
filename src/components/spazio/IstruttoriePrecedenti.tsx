'use client';

// Istruttorie precedenti dell'azienda: il lavoro archiviato quando un nuovo
// triage ha aperto un nuovo ciclo (src/lib/cicloAzienda.ts). Sola lettura.

import React, { useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import { elencaCicliAziendaAction } from '@/app/actions/aziendaInVerifica';
import type { CicloArchiviato } from '@/lib/cicloAzienda';

const data = (iso: string) => new Date(iso).toLocaleDateString('it-IT');

export function IstruttoriePrecedenti({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const [cicli, setCicli] = useState<CicloArchiviato[]>([]);
  useEffect(() => {
    elencaCicliAziendaAction(nomeSchema, aziendaId).then((r) => {
      if (r.success && r.cicli) setCicli(r.cicli);
    });
  }, [nomeSchema, aziendaId]);
  if (cicli.length === 0) return null;
  return (
    <details className="bg-white border border-slate-200 rounded-xl p-5">
      <summary className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider cursor-pointer">
        <Archive className="w-4 h-4 text-slate-500" />
        Istruttorie precedenti ({cicli.length})
      </summary>
      <p className="text-[11px] text-slate-500 mt-2">
        Lavoro archiviato quando un nuovo triage ha riaperto l’istruttoria su questa azienda. Non
        entra nei calcoli attuali.
      </p>
      <div className="mt-3 space-y-3">
        {cicli.map((c) => (
          <details key={c.id} className="border border-slate-100 rounded-lg p-3">
            <summary className="text-xs text-slate-800 cursor-pointer">
              Archiviata il <b>{data(c.archiviatoIl)}</b>
              {c.screeningDel && <> · screening del {data(c.screeningDel)}</>}
              <span className="text-slate-500">
                {' '}
                · {c.partiteVera} partite V.E.R.A. · {c.posizioniTriage} posizioni del triage ·{' '}
                {c.risposteChecklist} risposte di Check List
              </span>
            </summary>
            {c.relazioneScreening ? (
              <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed mt-3">
                {c.relazioneScreening}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 mt-2">Nessuna relazione di screening.</p>
            )}
          </details>
        ))}
      </div>
    </details>
  );
}
