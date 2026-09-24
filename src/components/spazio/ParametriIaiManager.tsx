'use client';

// Parametri dell'Indice di Attenzione Istruttoria — Parametri di Spazio.
// Pesi delle cinque dimensioni e minimi dei vincoli, dell'ente. I pesi non
// compaiono in copertina (scelta di Ercole): sono configurazione, non
// informazione sulla posizione. Restano dichiarati qui, stampabili come nota
// metodologica, perche' il metodo OCSE-JRC lo richiede.

import React, { useEffect, useState } from 'react';
import { Gauge, Save, RotateCcw, Printer } from 'lucide-react';
import { ottieniParametriIaiAction, salvaParametriIaiAction } from '@/app/actions/iai';
import {
  NOME_DIMENSIONE,
  NOME_VINCOLO,
  PARAMETRI_IAI_PREDEFINITI,
  type Dimensione,
  type ParametriIai,
} from '@/lib/iai/indice';
import { stampaHtml } from '@/lib/stampaTesto';
import { DESCRIZIONE_DIMENSIONE, htmlNotaMetodologica } from '@/lib/iai/notaHtml';
import { confermaApp } from '@/components/FinestreApp';

export function ParametriIaiManager({
  nomeSchema,
  codice,
}: {
  nomeSchema: string;
  codice: string;
}) {
  const [p, setP] = useState<ParametriIai>(PARAMETRI_IAI_PREDEFINITI);
  const [personalizzati, setPersonalizzati] = useState(false);
  const [modificato, setModificato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    const r = await ottieniParametriIaiAction(nomeSchema);
    if (r.success) {
      setP(r.parametri);
      setPersonalizzati(r.personalizzati);
    } else setErrore(r.error ?? 'Lettura non riuscita.');
    setModificato(false);
  };
  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const somma = (Object.values(p.pesi) as number[]).reduce((s, x) => s + x, 0);
  const num = (v: string) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

  const stampaNota = () => {
    stampaHtml(
      'Nota metodologica — Indice di Attenzione Istruttoria',
      htmlNotaMetodologica(p, personalizzati),
      'Configurazione dichiarata dell’indice. Con il flag attivo è anche l’ultima sezione del PDF dello Screening.',
      null
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 border-b border-slate-100 pb-3">
        <Gauge className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Indice di Attenzione Istruttoria — pesi e vincoli
          </h2>
          <p className="text-[11px] text-slate-600 mt-1">
            I pesi delle cinque dimensioni e i minimi dei vincoli sono dell’ente. Non compaiono
            nella copertina: sono configurazione, non informazione sulla posizione. Restano
            dichiarati qui e stampabili come nota metodologica. I valori proposti sono quelli
            iniziali; il metodo per definirli è il confronto a coppie (Saaty).
          </p>
        </div>
      </div>

      {errore && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {errore}
        </p>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold">Dimensione</th>
              <th className="px-3 py-2 font-bold w-24">Peso</th>
              <th className="px-3 py-2 font-bold w-16">Quota</th>
              <th className="px-3 py-2 font-bold">Che cosa misura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(Object.keys(p.pesi) as Dimensione[]).map((d) => (
              <tr key={d}>
                <td className="px-3 py-2 text-slate-900">
                  <b>{d}</b> · {NOME_DIMENSIONE[d]}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p.pesi[d]}
                    onChange={(e) => {
                      setP({ ...p, pesi: { ...p.pesi, [d]: num(e.target.value) } });
                      setModificato(true);
                    }}
                    className="w-20 p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {somma ? Math.round((p.pesi[d] / somma) * 100) : 0}%
                </td>
                <td className="px-3 py-2 text-slate-600">{DESCRIZIONE_DIMENSIONE[d]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">
        I pesi sono relativi: conta il rapporto fra loro, non la somma ({somma}).
      </p>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[9px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold">Vincolo di non compensabilità</th>
              <th className="px-3 py-2 font-bold w-40">Minimo dell’indice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(Object.keys(p.vincoli) as (keyof ParametriIai['vincoli'])[]).map((k) => (
              <tr key={k}>
                <td className="px-3 py-2 text-slate-900">{NOME_VINCOLO[k]}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p.vincoli[k]}
                    onChange={(e) => {
                      setP({ ...p, vincoli: { ...p.vincoli, [k]: num(e.target.value) } });
                      setModificato(true);
                    }}
                    className="w-20 p-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-800">
        <input
          type="checkbox"
          checked={p.notaNelReport}
          onChange={(e) => {
            setP({ ...p, notaNelReport: e.target.checked });
            setModificato(true);
          }}
        />
        Allega «Riferimenti e metodo» in coda al PDF (perimetro, documenti con impronta, fonti
        normative, titoli dell’ente, parametri dell’indice, basi, rilievi residui). Attivo per
        default; senza spunta il PDF esce senza allegato e i rilievi residui restano in calce al
        testo.
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!modificato}
          onClick={async () => {
            const r = await salvaParametriIaiAction(codice, {
              pesi: p.pesi,
              vincoli: p.vincoli,
              notaNelReport: p.notaNelReport,
            });
            if (!r.success) setErrore(r.error ?? 'Errore.');
            await carica();
          }}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          <Save className="w-3.5 h-3.5" /> Salva
        </button>
        <button
          type="button"
          onClick={async () => {
            if (
              !(await confermaApp(
                'Tornare ai valori predefiniti? I pesi e i vincoli dell’ente verranno sostituiti da quelli proposti dalla piattaforma.',
                { etichettaConferma: 'Torna ai predefiniti' }
              ))
            )
              return;
            const r = await salvaParametriIaiAction(codice, null);
            if (!r.success) setErrore(r.error ?? 'Errore.');
            await carica();
          }}
          className="flex items-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Predefiniti
        </button>
        <button
          type="button"
          onClick={stampaNota}
          className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
        >
          <Printer className="w-3.5 h-3.5" /> Stampa nota metodologica
        </button>
        <span className="text-[11px] text-slate-500">
          {personalizzati ? 'Valori dell’ente.' : 'Valori predefiniti.'}
          {modificato ? ' Modifiche non salvate.' : ''}
        </span>
      </div>
    </div>
  );
}
