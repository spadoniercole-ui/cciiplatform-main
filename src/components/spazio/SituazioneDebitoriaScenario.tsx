'use client';

// Situazione Debitoria dentro lo SCENARIO.
//
// Il contabilizzato è la base su cui si fanno i conti quando arriva una
// proposta: è legato a un evento e a una data, quindi appartiene allo
// scenario. La fotografia stabile dell'esposizione resta la Posizione
// V.E.R.A., che vive a livello azienda.
//
// Questo componente aggiunge una cosa sola al DebitiEnteScenario esistente:
// la possibilità di RIPRENDERE la posizione caricata a livello azienda prima
// dello spostamento. Quelle righe non sono state toccate né spostate — sono
// ancora lì — e vengono copiate nello scenario su richiesta esplicita.
// Copiate e non spostate, così un secondo scenario sulla stessa azienda può
// riprenderle a sua volta.

import React, { useEffect, useState } from 'react';
import { Download, AlertTriangle } from 'lucide-react';
import { DebitiEnteScenario } from '@/components/spazio/DebitiEnteScenario';
import {
  contaDebitiAziendaNonAttribuitiAction,
  riprendiDebitiAziendaInScenarioAction,
} from '@/app/actions/debitiEnte';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  nomeAzienda: string;
  scenarioId: number;
}

export function SituazioneDebitoriaScenario({
  nomeSchema,
  aziendaId,
  nomeAzienda,
  scenarioId,
}: Props) {
  const [nonAttribuite, setNonAttribuite] = useState<{ righe: number; totale: number } | null>(
    null
  );
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [chiave, setChiave] = useState(0);

  useEffect(() => {
    void contaDebitiAziendaNonAttribuitiAction(nomeSchema, aziendaId).then((r) => {
      if (r.success && (r.righe ?? 0) > 0) {
        setNonAttribuite({ righe: r.righe ?? 0, totale: r.totale ?? 0 });
      } else {
        setNonAttribuite(null);
      }
    });
  }, [nomeSchema, aziendaId, chiave]);

  const riprendi = async () => {
    setInCorso(true);
    setMessaggio(null);
    const r = await riprendiDebitiAziendaInScenarioAction(nomeSchema, aziendaId, scenarioId);
    setInCorso(false);
    if (r.success) {
      setMessaggio(`${r.copiate} righe riprese nello scenario.`);
      // Forza il ricaricamento dell'elenco sottostante.
      setChiave((k) => k + 1);
    } else {
      setMessaggio(r.error ?? 'Operazione non riuscita.');
    }
  };

  return (
    <div className="space-y-4">
      {nonAttribuite && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 leading-relaxed">
              Questa azienda ha <span className="font-bold">{nonAttribuite.righe} righe</span> di
              posizione debitoria caricate a livello azienda, per{' '}
              <span className="font-bold">
                {Math.round(nonAttribuite.totale).toLocaleString('it-IT')} €
              </span>
              , da prima che la Situazione Debitoria si spostasse nello scenario. Non sono state
              toccate: puoi riprenderle qui.
            </p>
          </div>
          <button
            onClick={() => void riprendi()}
            disabled={inCorso}
            className="flex items-center gap-2 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider hover:bg-amber-700 disabled:bg-slate-300"
          >
            <Download className="w-3.5 h-3.5" />
            {inCorso ? 'Ripresa in corso...' : 'Riprendi in questo scenario'}
          </button>
          {messaggio && <p className="text-[11px] text-amber-900 font-bold">{messaggio}</p>}
          <p className="text-[10px] text-amber-700 leading-relaxed">
            Le righe vengono <span className="font-bold">copiate</span>, non spostate: restano
            disponibili anche per un altro scenario della stessa azienda.
          </p>
        </div>
      )}

      <DebitiEnteScenario
        key={chiave}
        nomeSchema={nomeSchema}
        aziendaId={aziendaId}
        nomeAzienda={nomeAzienda}
        scenarioId={scenarioId}
      />
    </div>
  );
}
