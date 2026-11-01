'use client';

// GLI SCENARI DEL TRIAGE — liquidazione giudiziale e cram down, accanto al
// debito misurato.
//
// Il credito lo dà il triage (l'esposizione delle soglie applicabili); il rango
// lo sceglie l'operatore; le percentuali vengono dai Parametri dell'ente. Il
// componente non calcola nulla da sé: chiama `calcolaScenari`, che è puro e ha
// i suoi test, e mostra anche ciò che non si può calcolare e perché.
//
// NESSUNA PERCENTUALE INVENTATA. Se i parametri mancano, le due ipotesi dicono
// che cosa serve per calcolarle, con il rimando ai Parametri. Un confronto su
// numeri messi lì dalla piattaforma sarebbe peggio di nessun confronto.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, Loader2 } from 'lucide-react';
import {
  ottieniParametriScenariAction,
  salvaParametriScenariAction,
} from '@/app/actions/parametriScenari';
import { ottieniRangoCreditoAction, salvaRangoCreditoAction } from '@/app/actions/triagePerimetro';
import {
  calcolaScenari,
  PARAMETRI_VUOTI,
  RANGHI,
  type ParametriScenari,
  type RangoCredito,
} from '@/lib/triage/scenari';

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const euro = (n: number | null) =>
  n === null ? 'non calcolabile' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €`;

interface Props {
  nomeSchema: string;
  aziendaId: number;
  codice: string;
  /** L'esposizione dell'ente: la somma delle soglie applicabili del triage. */
  credito: number | null;
}

export function ScenariTriage({ nomeSchema, aziendaId, codice, credito }: Props) {
  const [parametri, setParametri] = useState<ParametriScenari>(PARAMETRI_VUOTI);
  const [rango, setRango] = useState<RangoCredito | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    setCaricamento(true);
    void Promise.all([
      ottieniParametriScenariAction(nomeSchema),
      ottieniRangoCreditoAction(nomeSchema, aziendaId),
    ]).then(([p, r]) => {
      if (annullato) return;
      if (p.success && p.parametri) setParametri(p.parametri);
      else setErrore(p.error ?? 'Parametri non leggibili.');
      if (r.success) setRango(r.rango ?? null);
      setCaricamento(false);
    });
    return () => {
      annullato = true;
    };
  }, [nomeSchema, aziendaId]);

  const salvaRango = async (valore: RangoCredito | null) => {
    setRango(valore);
    setSalvataggio(true);
    setErrore(null);
    setAvviso(null);
    const r = await salvaRangoCreditoAction(nomeSchema, aziendaId, valore);
    if (!r.success) setErrore(r.error ?? 'Rango non salvato.');
    else setAvviso('Rango del credito salvato.');
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento degli scenari…</p>;

  const esito = calcolaScenari({ credito, rango, parametri });
  const riga = rango ? parametri.ranghi.find((r) => r.rango === rango) : null;
  const parametriMancanti =
    !riga ||
    riga.tassoLiquidazionePct === null ||
    riga.cramDownPct === null ||
    parametri.costiProceduraPct === null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
          <Scale className="w-4 h-4 text-slate-500" />
          Confronto con gli scenari
        </h3>
        <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
          Quanto l’ente recupererebbe in una liquidazione giudiziale e quanto in un cram down
          omologato dal tribunale, sulle percentuali fissate dall’ente. Sono termini di paragone,
          non un giudizio su una proposta.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Credito dell’ente (dalle soglie del triage)
          <p className="mt-1 text-sm font-bold text-slate-900 normal-case">{euro(credito)}</p>
          <span className="text-[10px] font-normal text-slate-400">
            {credito === null
              ? 'Nessuna soglia applicabile con un importo: senza esposizione le percentuali non hanno base.'
              : 'Somma delle esposizioni delle soglie applicabili. Se una soglia non è determinabile, il credito reale può essere maggiore.'}
          </span>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Rango del credito
          <select
            value={rango ?? ''}
            disabled={salvataggio}
            onChange={(e) => void salvaRango((e.target.value || null) as RangoCredito | null)}
            className={`${CLASSE} mt-1`}
          >
            <option value="">Non indicato</option>
            {RANGHI.map((r) => (
              <option key={r.codice} value={r.codice}>
                {r.etichetta}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-normal text-slate-400">
            {salvataggio ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Salvataggio…
              </span>
            ) : (
              'Il rango decide quale riga dei parametri si applica a questo credito.'
            )}
          </span>
        </label>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[esito.liquidazione, esito.cramDown].map((ipotesi) => (
          <div
            key={ipotesi.nome}
            className={`rounded-xl border p-4 ${
              ipotesi.calcolabile ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {ipotesi.nome}
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1">{euro(ipotesi.netto)}</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{ipotesi.dettaglio}</p>
            {!ipotesi.calcolabile && (
              <p className="text-[10px] text-amber-900 mt-1">Manca: {ipotesi.motivo}.</p>
            )}
          </div>
        ))}
      </div>

      {esito.confronto && (
        <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <b>Differenza:</b> {esito.confronto.testo}
        </p>
      )}

      {parametriMancanti && (
        <p className="text-[11px] text-slate-600">
          Le percentuali di questo rango non sono ancora impostate. Si configurano in{' '}
          <Link
            href={`/spazio/${codice}/parametri/scenari`}
            className="font-bold underline hover:text-slate-900"
          >
            Parametri di Spazio → Scenari
          </Link>
          , con i valori dell’ente: la piattaforma non ne propone nessuno.
        </p>
      )}

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Il confronto non è un giudizio di convenienza su una proposta e non stima l’attivo
        dell’azienda: applica al credito dell’ente le percentuali configurate. Il cram down non
        sottrae spese di procedura, perché la percentuale è già l’esito dell’omologazione.
      </p>
    </div>
  );
}
