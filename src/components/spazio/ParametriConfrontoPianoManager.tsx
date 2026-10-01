'use client';

// Soglie dei semafori del confronto tra piano dell'azienda e piano
// automatico di settore. Lo scostamento si misura solo in direzione
// favorevole all'azienda: quello prudente è sempre verde.

import React, { useEffect, useState } from 'react';
import { Scale, Save, RotateCcw } from 'lucide-react';
import {
  ottieniSoglieConfrontoAction,
  salvaSoglieConfrontoAction,
} from '@/app/actions/pianoAziendale';
import { SOGLIE_PREDEFINITE } from '@/lib/piano/confronto';

export function ParametriConfrontoPianoManager({
  nomeSchema,
  codice,
}: {
  nomeSchema: string;
  codice: string;
}) {
  const [verde, setVerde] = useState(String(SOGLIE_PREDEFINITE.verde));
  const [giallo, setGiallo] = useState(String(SOGLIE_PREDEFINITE.giallo));
  const [personalizzate, setPersonalizzate] = useState(false);
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null);

  const carica = async () => {
    const r = await ottieniSoglieConfrontoAction(nomeSchema);
    setVerde(String(r.soglie.verde));
    setGiallo(String(r.soglie.giallo));
    setPersonalizzate(r.personalizzate);
  };
  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const salva = async (predefinite: boolean) => {
    const r = await salvaSoglieConfrontoAction(
      codice,
      predefinite
        ? null
        : { verde: Number(verde.replace(',', '.')), giallo: Number(giallo.replace(',', '.')) }
    );
    setMessaggio(
      r.success
        ? {
            ok: true,
            testo: predefinite ? 'Ripristinate le soglie predefinite.' : 'Soglie salvate.',
          }
        : { ok: false, testo: r.error ?? 'Salvataggio non riuscito.' }
    );
    await carica();
  };

  const input =
    'w-24 p-2 text-sm text-right border border-slate-200 rounded-lg bg-white text-slate-900';
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Scale className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Confronto con il piano di settore — soglie dei semafori
          </h2>
          <p className="text-[11px] text-slate-600 mt-1">
            Nel passo «Piano di sviluppo» il piano (quello dell’azienda per chi riceve la proposta,
            la variante in lavorazione per chi la redige) si confronta con il piano automatico di
            settore, voce per voce e anno per anno. Lo scostamento si misura nella direzione
            favorevole all’azienda (ricavi più alti, costi più bassi, incassi più rapidi…); quello
            nella direzione prudente è sempre verde.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <label className="text-xs text-slate-700 space-y-1">
          <span className="block text-[10px] font-bold text-slate-500 uppercase">
            Verde fino a (%)
          </span>
          <input
            className={input}
            value={verde}
            onChange={(e) => setVerde(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <label className="text-xs text-slate-700 space-y-1">
          <span className="block text-[10px] font-bold text-slate-500 uppercase">
            Giallo fino a (%)
          </span>
          <input
            className={input}
            value={giallo}
            onChange={(e) => setGiallo(e.target.value)}
            inputMode="decimal"
          />
        </label>
        <p className="text-[11px] text-slate-600 pb-2">Oltre la soglia gialla: rosso.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => salva(false)}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          <Save className="w-3.5 h-3.5" /> Salva le soglie
        </button>
        {personalizzate && (
          <button
            type="button"
            onClick={() => salva(true)}
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Ripristina {SOGLIE_PREDEFINITE.verde}% e{' '}
            {SOGLIE_PREDEFINITE.giallo}%
          </button>
        )}
        <span className="text-[11px] text-slate-500">
          {personalizzate ? 'Soglie personalizzate dall’ente.' : 'Soglie predefinite.'}
        </span>
      </div>
      {messaggio && (
        <p
          className={`text-xs rounded-lg p-2 border ${messaggio.ok ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-red-800 bg-red-50 border-red-200'}`}
        >
          {messaggio.testo}
        </p>
      )}
    </div>
  );
}
