'use client';

// Limiti quantitativi della generazione Screening (per-spazio): quante
// direttrici, quanti prodotti per direttrice, quante domande totali. Servono
// a evitare "report monstre" e consumo inutile di token. Collocato nella
// pagina Direttrici Ente perché è dove si configura lo Screening.

import React, { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  ottieniLimitiScreening,
  aggiornaLimitiScreeningAction,
  type LimitiGenerazioneScreening,
} from '@/app/actions/parametriSpazio';
import {
  SCREENING_MAX_DOMANDE_MIN,
  SCREENING_MAX_DOMANDE_LIMITE,
  SCREENING_MAX_DIRETTRICI_MIN,
  SCREENING_MAX_DIRETTRICI_LIMITE,
  SCREENING_MAX_PRODOTTI_MIN,
  SCREENING_MAX_PRODOTTI_LIMITE,
} from '@/lib/parametriGenerazione';

interface Props {
  nomeSchema: string;
}

export function ScreeningLimitiControl({ nomeSchema }: Props) {
  const [limiti, setLimiti] = useState<LimitiGenerazioneScreening | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const r = await ottieniLimitiScreening(nomeSchema);
      if (r.success) setLimiti(r.limiti);
      else setErrore(r.error || 'Impossibile caricare i limiti.');
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const aggiorna = (campo: keyof LimitiGenerazioneScreening, valore: number) => {
    setLimiti((prev) => (prev ? { ...prev, [campo]: valore } : prev));
    setSalvato(false);
  };

  const handleSalva = async () => {
    if (!limiti) return;
    setSalvataggio(true);
    setSalvato(false);
    setErrore(null);
    const r = await aggiornaLimitiScreeningAction(nomeSchema, limiti);
    if (r.success) setSalvato(true);
    else setErrore(r.error || 'Impossibile salvare.');
    setSalvataggio(false);
  };

  if (caricamento || !limiti) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const campi: {
    key: keyof LimitiGenerazioneScreening;
    label: string;
    min: number;
    max: number;
  }[] = [
    {
      key: 'maxDirettrici',
      label: 'Max direttrici',
      min: SCREENING_MAX_DIRETTRICI_MIN,
      max: SCREENING_MAX_DIRETTRICI_LIMITE,
    },
    {
      key: 'maxProdotti',
      label: 'Max prodotti per direttrice',
      min: SCREENING_MAX_PRODOTTI_MIN,
      max: SCREENING_MAX_PRODOTTI_LIMITE,
    },
    {
      key: 'maxDomande',
      label: 'Max domande totali',
      min: SCREENING_MAX_DOMANDE_MIN,
      max: SCREENING_MAX_DOMANDE_LIMITE,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Limiti di generazione (AI)
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Quante direttrici, quanti prodotti per direttrice e quante domande totali può avere il
        questionario di Screening. Abbassali per evitare report enormi e consumo inutile di token;
        vengono forzati nella generazione (direttrici e prodotti in eccesso non vengono nemmeno
        passati all&apos;AI).
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        {campi.map((c) => (
          <div key={c.key}>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              {c.label}
            </label>
            <input
              type="number"
              min={c.min}
              max={c.max}
              value={limiti[c.key]}
              onChange={(e) => {
                const v = Number(e.target.value);
                aggiorna(c.key, Number.isNaN(v) ? c.min : v);
              }}
              className="w-24 p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
            <p className="text-[9px] text-slate-400 mt-0.5">
              {c.min}–{c.max}
            </p>
          </div>
        ))}
        <button
          type="button"
          onClick={handleSalva}
          disabled={salvataggio}
          className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
        >
          {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>

      {salvato && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          Limiti salvati. Valgono per la prossima generazione dello Screening di questo spazio.
        </div>
      )}
    </div>
  );
}
