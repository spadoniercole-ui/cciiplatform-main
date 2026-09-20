'use client';

// CRUSCOTTO DI SINTESI, in testata alla scheda azienda.
//
// Serve a chi torna su una posizione dopo settimane, o a chi ne lavora molte:
// evita di ricostruire a mente dove si era rimasti. Sta in testata e non
// nella sola Anagrafica perché chi torna non entra sempre da lì — spesso
// apre direttamente lo Screening o la Posizione Ente.
//
// ---------------------------------------------------------------------------
// IL RISCHIO CHE QUESTA COMPONENTE DEVE EVITARE
//
// Numeri di una verifica vecchia, mostrati come se fossero di oggi, sono
// PEGGIO di nessun numero: chi apre la scheda li legge come stato attuale e
// riparte da lì. Perciò la data e lo stato di validità stanno accanto ai
// numeri, non sepolti da qualche parte, e quando il giudizio è scaduto i
// numeri restano leggibili ma visibilmente attenuati.
//
// I VALORI SI RICALCOLANO, NON SI MEMORIZZANO. L'indicatore è costruito così
// di proposito: non essendo salvato non può divergere dai dati. Conservarne
// una copia qui reintrodurrebbe esattamente il problema che si era evitato —
// un cruscotto che mostra numeri che il resto della piattaforma ha già
// superato.
//
// E si mostrano POCHE cose: un cruscotto che elenca quindici numeri non
// rinfresca la memoria, la sovraccarica.

import React, { useEffect, useState } from 'react';
import { ottieniAttenzioneScreeningAction } from '@/app/actions/attenzioneScreening';
import { ottieniStoricoVerificheAction } from '@/app/actions/aziendaInVerifica';
import { valutaValidita } from '@/lib/screening/validitaVerifica';
import type { Attenzione } from '@/lib/screening/indicatore';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

const STILE = {
  ROSSO: { pallino: 'bg-red-500', testo: 'text-red-800' },
  GIALLO: { pallino: 'bg-amber-400', testo: 'text-amber-800' },
  ATTENZIONE_MINIMA: { pallino: 'bg-emerald-500', testo: 'text-emerald-800' },
} as const;

export function CruscottoAzienda({ nomeSchema, aziendaId }: Props) {
  const [attenzione, setAttenzione] = useState<Attenzione | null>(null);
  const [eseguitaIl, setEseguitaIl] = useState<string | null>(null);

  useEffect(() => {
    void ottieniAttenzioneScreeningAction(nomeSchema, aziendaId).then((r) => {
      if (r.success && r.attenzione) setAttenzione(r.attenzione);
    });
    void ottieniStoricoVerificheAction(nomeSchema).then((r) => {
      const mia = r.righe?.find((v) => v.id === aziendaId);
      if (mia?.eseguitaIl) setEseguitaIl(mia.eseguitaIl);
    });
  }, [nomeSchema, aziendaId]);

  // Nessuna verifica mai fatta: non si mostra un cruscotto vuoto, che
  // occuperebbe spazio senza dire nulla.
  if (!attenzione) return null;

  const s = STILE[attenzione.esito];
  const validita = valutaValidita(eseguitaIl);
  const scaduto = validita.stato === 'da_rivedere';

  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        scaduto ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${scaduto ? 'opacity-60' : ''}`}>
        <span className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${s.pallino}`} />
          <span className={`text-xs font-bold ${s.testo}`}>{attenzione.etichetta}</span>
        </span>

        <span className="text-[11px] text-slate-500">{attenzione.fattoreDeterminante}</span>

        <span className="text-[11px] text-slate-400">
          Copertura {attenzione.copertura.determinate}/{attenzione.copertura.totali}
        </span>

        {/* La data e la validità stanno QUI, accanto ai numeri: un cruscotto
            che non dice quanto è vecchio è un cruscotto che mente. */}
        <span
          className={`ml-auto text-[11px] ${
            scaduto
              ? 'font-bold text-amber-700'
              : validita.stato === 'in_scadenza'
                ? 'text-amber-600'
                : 'text-slate-400'
          }`}
        >
          {eseguitaIl
            ? `Verificata il ${new Date(eseguitaIl).toLocaleDateString('it-IT')} · ${validita.etichetta}`
            : 'Data della verifica non registrata'}
        </span>
      </div>

      {scaduto && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-amber-800">
          Questi numeri hanno più di sei mesi: una posizione previdenziale cambia in quel tempo.
          Rifai la verifica sui documenti aggiornati prima di fondarci una decisione.
        </p>
      )}
    </div>
  );
}
