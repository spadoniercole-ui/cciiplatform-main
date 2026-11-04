'use client';

// PARAMETRI DEGLI SCENARI — le percentuali che l'ente fissa una volta.
//
// Due ipotesi, due colonne: il realizzo in liquidazione giudiziale e il
// soddisfacimento nel cram down. Le spese di procedura stanno sopra, perché
// valgono per tutte le righe.
//
// VUOTO NON È ZERO. Un campo lasciato vuoto non diventa 0%: il report dirà
// «non calcolabile» e indicherà quale percentuale manca.
//
// IL SUGGERIMENTO NON È UN VALORE (0.159.0). La ricerca web propone le
// percentuali con le sue fonti; il numero entra nel calcolo solo quando
// l'Admin lo salva. Suggerito e confermato restano distinguibili, con la data
// della ricerca: un numero senza fonte non si applica da solo.
//
// LA QUOTA ATTESA DALL'ENTE è il termine di confronto del report: quanto
// l'ente considera dovuto sul proprio credito (per l'INPS, il 100%). Senza,
// la tabella del report dichiara che manca.

import React, { useEffect, useState } from 'react';
import { Save, Loader2, Info, Sparkles, ExternalLink } from 'lucide-react';
import {
  ottieniParametriScenariAction,
  salvaParametriScenariAction,
  suggerisciParametriScenariAction,
  type SuggerimentoParametri,
} from '@/app/actions/parametriScenari';
import {
  PARAMETRI_VUOTI,
  RANGHI,
  validaParametri,
  type ParametriScenari,
} from '@/lib/triage/scenari';

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const numero = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export function ParametriScenariManager({ nomeSchema }: { nomeSchema: string }) {
  const [parametri, setParametri] = useState<ParametriScenari>(PARAMETRI_VUOTI);
  const [attesa, setAttesa] = useState<number | null>(null);
  const [suggerimento, setSuggerimento] = useState<SuggerimentoParametri | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [ricerca, setRicerca] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const carica = async () => {
    const r = await ottieniParametriScenariAction(nomeSchema);
    if (r.success && r.parametri) {
      setParametri(r.parametri);
      setAttesa(r.soddisfazioneAttesaPct ?? null);
      setSuggerimento(r.suggerimento ?? null);
    } else {
      setErrore(r.error ?? 'Parametri non leggibili.');
    }
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const aggiornaRango = (
    rango: (typeof RANGHI)[number]['codice'],
    campo: 'tassoLiquidazionePct' | 'cramDownPct',
    valore: number | null
  ) => {
    setParametri((prev) => ({
      ...prev,
      ranghi: prev.ranghi.map((r) => (r.rango === rango ? { ...r, [campo]: valore } : r)),
    }));
    setAvviso(null);
  };

  const suggerisci = async () => {
    setRicerca(true);
    setErrore(null);
    setAvviso(null);
    const r = await suggerisciParametriScenariAction(nomeSchema);
    if (r.success) {
      setSuggerimento(r.suggerimento ?? null);
      if (r.parametri) setParametri(r.parametri);
      setAttesa(r.soddisfazioneAttesaPct ?? attesa);
      setAvviso(
        'Ricerca completata: le percentuali proposte sono qui sotto, con le fonti. Non sono ancora in uso — applicale e salva per confermarle.'
      );
    } else {
      setErrore(r.error ?? 'Ricerca non riuscita.');
    }
    setRicerca(false);
  };

  const applica = () => {
    if (!suggerimento) return;
    setParametri((prev) => ({
      costiProceduraPct: suggerimento.costiProceduraPct ?? prev.costiProceduraPct,
      ranghi: prev.ranghi.map((r) => {
        const s = suggerimento.ranghi.find((x) => x.rango === r.rango);
        return s
          ? {
              ...r,
              tassoLiquidazionePct: s.tassoLiquidazionePct ?? r.tassoLiquidazionePct,
              cramDownPct: s.cramDownPct ?? r.cramDownPct,
            }
          : r;
      }),
    }));
    setAvviso('Suggerimenti riportati nei campi: salva per confermarli.');
  };

  const salva = async () => {
    const errori = validaParametri(parametri);
    if (errori.length > 0) {
      setErrore(errori.join(' '));
      return;
    }
    setSalvataggio(true);
    setErrore(null);
    setAvviso(null);
    const r = await salvaParametriScenariAction(nomeSchema, parametri, attesa);
    if (r.success) {
      setAvviso('Parametri salvati: sono questi i valori che il report usa.');
      await carica();
    } else {
      setErrore(r.error ?? 'Salvataggio non riuscito.');
    }
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento…</p>;

  const suggerito = (rango: string, campo: 'tassoLiquidazionePct' | 'cramDownPct') =>
    suggerimento?.ranghi.find((r) => r.rango === rango)?.[campo] ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Scenari del triage
        </h2>
        <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
          Le percentuali con cui il report confronta il credito dell’ente con la liquidazione
          giudiziale e con un cram down omologato. Non c’è un valore di default: finché una riga è
          vuota, l’ipotesi corrispondente si dichiara non calcolabile. La ricerca web propone i
          valori con le fonti; solo quelli che salvi entrano nel calcolo.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block max-w-xs text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Spese di procedura (% sul realizzo lordo)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={parametri.costiProceduraPct ?? ''}
            onChange={(e) =>
              setParametri((prev) => ({ ...prev, costiProceduraPct: numero(e.target.value) }))
            }
            className={`${CLASSE} mt-1`}
          />
        </label>
        <label className="block max-w-xs text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Quota attesa dall’ente sul proprio credito (%)
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={attesa ?? ''}
            onChange={(e) => setAttesa(numero(e.target.value))}
            className={`${CLASSE} mt-1`}
            aria-label="Quota attesa dall'ente"
          />
        </label>
        <button
          type="button"
          onClick={() => void suggerisci()}
          disabled={ricerca}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 text-slate-700 font-bold uppercase tracking-wider rounded-lg text-[10px]"
        >
          {ricerca ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {ricerca ? 'Ricerca in corso…' : 'Suggerisci con ricerca web'}
        </button>
      </div>

      <p className="text-[10px] text-slate-400 max-w-3xl leading-relaxed">
        La quota attesa è il termine di confronto del report: quanto l’ente considera dovuto sul
        proprio credito (per l’INPS, il 100%). Senza, la tabella dice che manca invece di assumerla.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="border-b border-slate-200 px-2 py-2">Rango</th>
              <th className="border-b border-slate-200 px-2 py-2">Realizzo in liquidazione %</th>
              <th className="border-b border-slate-200 px-2 py-2">Cram down %</th>
              <th className="border-b border-slate-200 px-2 py-2">A cosa serve</th>
            </tr>
          </thead>
          <tbody>
            {RANGHI.map((r) => {
              const riga = parametri.ranghi.find((x) => x.rango === r.codice);
              const sLiquidazione = suggerito(r.codice, 'tassoLiquidazionePct');
              const sCram = suggerito(r.codice, 'cramDownPct');
              return (
                <tr key={r.codice}>
                  <td className="border-b border-slate-100 px-2 py-2 font-bold text-slate-800">
                    {r.etichetta}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={riga?.tassoLiquidazionePct ?? ''}
                      onChange={(e) =>
                        aggiornaRango(r.codice, 'tassoLiquidazionePct', numero(e.target.value))
                      }
                      className={CLASSE}
                      aria-label={`Realizzo in liquidazione ${r.etichetta}`}
                    />
                    {sLiquidazione !== null && (
                      <span className="block text-[10px] text-sky-700 mt-1">
                        suggerito: {sLiquidazione}%
                        {riga?.tassoLiquidazionePct === sLiquidazione ? ' (in uso)' : ''}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={riga?.cramDownPct ?? ''}
                      onChange={(e) =>
                        aggiornaRango(r.codice, 'cramDownPct', numero(e.target.value))
                      }
                      className={CLASSE}
                      aria-label={`Cram down ${r.etichetta}`}
                    />
                    {sCram !== null && (
                      <span className="block text-[10px] text-sky-700 mt-1">
                        suggerito: {sCram}%{riga?.cramDownPct === sCram ? ' (in uso)' : ''}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-2 text-[10px] text-slate-500">
                    {r.aiuto}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {suggerimento && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-900">
              Valori proposti dalla ricerca
              {suggerimento.generatoIl
                ? ` — ${new Date(suggerimento.generatoIl).toLocaleString('it-IT')}`
                : ''}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applica}
                className="px-2.5 py-1.5 bg-sky-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-sky-800"
              >
                Applica i suggerimenti
              </button>
            </div>
          </div>
          {suggerimento.costiProceduraPct !== null && (
            <p className="text-[11px] text-slate-700">
              Spese di procedura proposte: {suggerimento.costiProceduraPct}%
            </p>
          )}
          {suggerimento.nota && (
            <p className="text-[11px] text-slate-700 leading-relaxed">{suggerimento.nota}</p>
          )}
          {suggerimento.fonti.length > 0 ? (
            <ul className="space-y-1">
              {suggerimento.fonti.map((f, i) => (
                <li key={`${f.url}-${i}`} className="text-[11px]">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-800 underline hover:text-sky-900"
                  >
                    {f.titolo || f.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-amber-900">
              La ricerca non ha riportato fonti: i valori proposti vanno riscontrati a mano prima di
              applicarli.
            </p>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[10px] text-slate-500 max-w-3xl">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        La liquidazione sottrae le spese di procedura dal realizzo lordo; il cram down no, perché la
        percentuale è già l’esito dell’omologazione. Le percentuali valgono per tutte le aziende
        dello spazio.
      </p>

      {errore && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {errore}
        </p>
      )}
      {avviso && (
        <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2">
          {avviso}
        </p>
      )}

      <button
        type="button"
        onClick={() => void salva()}
        disabled={salvataggio}
        className="flex items-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
      >
        {salvataggio ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
        Salva parametri
      </button>
    </div>
  );
}
