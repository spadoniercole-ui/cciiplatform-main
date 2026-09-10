'use client';

// Soglie di segnalazione dell'art. 25-novies, nei Parametri di Spazio.
//
// La regola dell'interfaccia è una sola: il valore DI LEGGE resta sempre
// visibile accanto a quello impostato. Chi modifica una soglia cambia
// l'esito di una valutazione, e uno scostamento deve restare riconoscibile —
// non diventare la nuova normalità che nessuno ricorda di aver introdotto.

import React, { useEffect, useState } from 'react';
import { Scale, RotateCcw, Save, AlertTriangle } from 'lucide-react';
import {
  ottieniParametriSoglieAction,
  salvaParametriSoglieAction,
} from '@/app/actions/parametriSoglie';
import { SOGLIE_DI_LEGGE, type ParametriSoglie } from '@/lib/soglie25novies/parametri';

interface Props {
  nomeSchema: string;
}

type Campo = {
  chiave: keyof ParametriSoglie;
  label: string;
  gruppo: string;
  percentuale?: boolean;
  giorni?: boolean;
};

const CAMPI: Campo[] = [
  {
    chiave: 'inpsPercentuale',
    label: 'Percentuale dei contributi dovuti nell’anno precedente',
    gruppo: 'INPS — imprese con lavoratori',
    percentuale: true,
  },
  {
    chiave: 'inpsImportoConLavoratori',
    label: 'Importo minimo (congiunto alla percentuale)',
    gruppo: 'INPS — imprese con lavoratori',
  },
  {
    chiave: 'inpsImportoSenzaLavoratori',
    label: 'Importo',
    gruppo: 'INPS — imprese senza lavoratori',
  },
  { chiave: 'inail', label: 'Premi assicurativi non versati', gruppo: 'INAIL' },
  {
    chiave: 'ivaImporto',
    label: 'Importo minimo',
    gruppo: 'Agenzia delle Entrate (IVA)',
  },
  {
    chiave: 'ivaPercentualeVolumeAffari',
    label: 'Percentuale del volume d’affari',
    gruppo: 'Agenzia delle Entrate (IVA)',
    percentuale: true,
  },
  {
    chiave: 'ivaImportoAssoluto',
    label: 'Importo oltre il quale scatta in ogni caso',
    gruppo: 'Agenzia delle Entrate (IVA)',
  },
  {
    chiave: 'aerImpresaIndividuale',
    label: 'Imprese individuali',
    gruppo: 'Agenzia Entrate-Riscossione',
  },
  {
    chiave: 'aerSocietaPersone',
    label: 'Società di persone',
    gruppo: 'Agenzia Entrate-Riscossione',
  },
  { chiave: 'aerAltreSocieta', label: 'Altre società', gruppo: 'Agenzia Entrate-Riscossione' },
  {
    chiave: 'giorniRitardo',
    label: 'Giorni di ritardo nel versamento',
    gruppo: 'Requisito temporale',
    giorni: true,
  },
];

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white font-mono focus:outline-none focus:ring-2 focus:ring-sky-500';

function formatta(c: Campo, v: number): string {
  if (c.percentuale) return `${(v * 100).toLocaleString('it-IT')}%`;
  if (c.giorni) return `${v} giorni`;
  return `${v.toLocaleString('it-IT')} €`;
}

export function ParametriSoglieViewer({ nomeSchema }: Props) {
  const [p, setP] = useState<ParametriSoglie | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    void ottieniParametriSoglieAction(nomeSchema).then((r) => {
      if (r.success && r.parametri) setP(r.parametri);
      else setErrore(r.error ?? 'Lettura non riuscita.');
    });
  }, [nomeSchema]);

  const salva = async () => {
    if (!p) return;
    setSalvataggio(true);
    setMessaggio(null);
    setErrore(null);
    const r = await salvaParametriSoglieAction(nomeSchema, p);
    if (r.success) setMessaggio('Soglie salvate.');
    else setErrore(r.error ?? 'Salvataggio non riuscito.');
    setSalvataggio(false);
  };

  if (!p) {
    return <p className="text-xs text-slate-400">{errore ?? 'Caricamento...'}</p>;
  }

  const scostamenti = CAMPI.filter((c) => p[c.chiave] !== SOGLIE_DI_LEGGE[c.chiave]);
  const gruppi = Array.from(new Set(CAMPI.map((c) => c.gruppo)));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
          <Scale className="w-4 h-4 text-slate-500" />
          Soglie di segnalazione — art. 25-novies CCII
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Gli importi sono di legge, non nostri. Sono modificabili perché una riforma non debba
          imporre un aggiornamento del programma — non perché ogni ente scelga le proprie soglie. Il
          valore di legge resta sempre visibile accanto a quello impostato.
        </p>
      </div>

      {scostamenti.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            {scostamenti.length === 1
              ? 'Una soglia si discosta dal valore di legge.'
              : `${scostamenti.length} soglie si discostano dal valore di legge.`}{' '}
            Le valutazioni di questo spazio useranno i valori impostati qui.
          </p>
        </div>
      )}

      {gruppi.map((g) => (
        <div key={g} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">{g}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CAMPI.filter((c) => c.gruppo === g).map((c) => {
              const diverso = p[c.chiave] !== SOGLIE_DI_LEGGE[c.chiave];
              return (
                <div key={c.chiave}>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    {c.label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={c.percentuale ? '0.01' : c.giorni ? '1' : '0.01'}
                    value={p[c.chiave]}
                    onChange={(e) => setP({ ...p, [c.chiave]: Number(e.target.value) })}
                    className={`${CLASSE} ${diverso ? 'border-amber-400' : ''}`}
                  />
                  <p className="text-[10px] mt-1 flex items-center gap-2">
                    <span className={diverso ? 'text-amber-700 font-bold' : 'text-slate-400'}>
                      Valore di legge: {formatta(c, SOGLIE_DI_LEGGE[c.chiave])}
                    </span>
                    {diverso && (
                      <button
                        onClick={() => setP({ ...p, [c.chiave]: SOGLIE_DI_LEGGE[c.chiave] })}
                        className="text-sky-700 hover:underline font-bold"
                      >
                        ripristina
                      </button>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void salva()}
          disabled={salvataggio}
          className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
        >
          <Save className="w-3.5 h-3.5" />
          {salvataggio ? 'Salvataggio...' : 'Salva soglie'}
        </button>
        {scostamenti.length > 0 && (
          <button
            onClick={() => setP({ ...SOGLIE_DI_LEGGE })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Ripristina tutti i valori di legge
          </button>
        )}
        {messaggio && <span className="text-[11px] text-emerald-700 font-bold">{messaggio}</span>}
        {errore && <span className="text-[11px] text-red-700 font-bold">{errore}</span>}
      </div>
    </div>
  );
}
