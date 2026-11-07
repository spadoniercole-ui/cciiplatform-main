'use client';

// GLI SCENARI DEL TRIAGE — liquidazione giudiziale e cram down, accanto al
// debito misurato.
//
// Il credito lo dà il triage (l'esposizione delle soglie applicabili); le
// percentuali vengono dai Parametri dell'ente. Il componente non calcola nulla
// da sé: chiama `calcolaScenari`, che è puro e ha i suoi test.
//
// TUTTI I RANGHI IN UN UNICO CONTESTO (0.174.8). Prima si sceglieva un rango
// da una tendina e si vedevano due card: il resto del confronto restava
// nascosto. La tabella mostra ogni rango nello stesso colpo d'occhio, così le
// differenze fra le ipotesi non dipendono da quante volte si cambia scelta.
// Non c'è una riga selezionata: il rango non è una preferenza dell'operatore,
// è un termine di paragone.
//
// NESSUNA PERCENTUALE INVENTATA. Se i parametri mancano, la cella dice che
// cosa serve per calcolare l'ipotesi, con il rimando ai Parametri. Un confronto
// su numeri messi lì dalla piattaforma sarebbe peggio di nessun confronto.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import { ottieniParametriScenariAction } from '@/app/actions/parametriScenari';
import {
  calcolaScenari,
  PARAMETRI_VUOTI,
  RANGHI,
  type ParametriScenari,
} from '@/lib/triage/scenari';

const euro = (n: number | null) =>
  n === null ? 'non calcolabile' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €`;

const percentuale = (n: number | null) =>
  n === null ? '—' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

interface Props {
  nomeSchema: string;
  codice: string;
  /** L'esposizione dell'ente: la somma delle soglie applicabili del triage. */
  credito: number | null;
}

export function ScenariTriage({ nomeSchema, codice, credito }: Props) {
  const [parametri, setParametri] = useState<ParametriScenari>(PARAMETRI_VUOTI);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    setCaricamento(true);
    void ottieniParametriScenariAction(nomeSchema).then((p) => {
      if (annullato) return;
      if (p.success && p.parametri) setParametri(p.parametri);
      else setErrore(p.error ?? 'Parametri non leggibili.');
      setCaricamento(false);
    });
    return () => {
      annullato = true;
    };
  }, [nomeSchema]);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento degli scenari…</p>;

  const righe = RANGHI.map((r) => ({
    rango: r,
    esito: calcolaScenari({ credito, rango: r.codice, parametri }),
  }));
  const mancanti = Array.from(new Set(righe.flatMap(({ esito }) => esito.mancanti)));

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
          <Scale className="w-4 h-4 text-slate-500" />
          Confronto con gli scenari
        </h3>
        <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
          Quanto l’ente recupererebbe in una liquidazione giudiziale e quanto in un cram down
          omologato dal tribunale, sulle percentuali fissate dall’ente, per ciascun rango del
          credito. Sono termini di paragone, non un giudizio su una proposta.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Credito dell’ente (dalle soglie del triage)
        </p>
        <p className="mt-1 text-sm font-bold text-slate-900">{euro(credito)}</p>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          {credito === null
            ? 'Nessuna soglia applicabile con un importo: senza esposizione le percentuali non hanno base.'
            : 'Somma delle esposizioni delle soglie applicabili. Se una soglia non è determinabile, il credito reale può essere maggiore.'}
        </p>
      </div>

      {errore && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {errore}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[780px] border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="px-3 py-3 align-bottom">
                Rango del credito
              </th>
              <th scope="col" className="px-3 py-3 align-bottom">
                Liquidazione giudiziale
                <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-400">
                  netto delle spese di procedura
                </span>
              </th>
              <th scope="col" className="px-3 py-3 align-bottom">
                Cram down omologato
                <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-400">
                  percentuale fissata dall’ente
                </span>
              </th>
              <th scope="col" className="px-3 py-3 align-bottom">
                Differenza
                <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-400">
                  liquidazione − cram down
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {righe.map(({ rango, esito }) => {
              const liquidazioneCalcolabile = esito.liquidazione.calcolabile;
              const cramCalcolabile = esito.cramDown.calcolabile;
              return (
                <tr key={rango.codice} className="border-t border-slate-100 align-top">
                  <th scope="row" className="px-3 py-3 text-left font-normal">
                    <p className="font-bold text-slate-900">{rango.etichetta}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400 leading-relaxed">
                      {rango.aiuto}
                    </p>
                  </th>
                  <td className="px-3 py-3">
                    <p
                      className={`font-bold tabular-nums ${
                        liquidazioneCalcolabile ? 'text-slate-900' : 'text-amber-800'
                      }`}
                    >
                      {euro(esito.liquidazione.netto)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">
                      {liquidazioneCalcolabile
                        ? `${percentuale(esito.liquidazione.percentuale)} del credito, meno ${percentuale(
                            parametri.costiProceduraPct
                          )} di spese`
                        : (esito.liquidazione.motivo ?? 'parametri incompleti')}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p
                      className={`font-bold tabular-nums ${
                        cramCalcolabile ? 'text-slate-900' : 'text-amber-800'
                      }`}
                    >
                      {euro(esito.cramDown.netto)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">
                      {cramCalcolabile
                        ? `${percentuale(esito.cramDown.percentuale)} del credito`
                        : (esito.cramDown.motivo ?? 'parametri incompleti')}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-bold tabular-nums text-slate-900">
                      {esito.confronto ? euro(esito.confronto.differenza) : '—'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500 leading-relaxed">
                      {esito.confronto
                        ? 'Differenza fra i due recuperi'
                        : 'Confronto non calcolabile'}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mancanti.length > 0 && (
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Per completare il confronto manca: {mancanti.join('; ')}. Le percentuali si configurano in{' '}
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
