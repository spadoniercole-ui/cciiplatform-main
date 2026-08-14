'use client';

// Brogliaccio Redigente — sintesi unica (non i 3 livelli con varchi del
// Ricevente). Raccoglie in ordine tutto quanto acquisito lungo il
// percorso Redigente come punto di partenza per scrivere la Proposta,
// e fa partire in automatico (silenzioso, server-side) il confronto con
// lo scenario liquidatorio, che la Relazione leggerà già pronto.

import React, { useEffect, useState } from 'react';
import { NotebookText, Sparkles, RefreshCw, Printer } from 'lucide-react';
import { ottieniBrogliaccio, type StatoBrogliaccio } from '@/app/actions/brogliaccio';
import { generaBrogliaccioRedigenteAction } from '@/app/actions/brogliaccioRedigente';
import {
  ottieniConfrontoLiquidatorio,
  type RisultatoConfrontoLiquidatorio,
} from '@/app/actions/confrontoLiquidatorio';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { stampaTesto } from '@/lib/stampaTesto';

interface Props {
  nomeSchema: string;
  scenarioId: number;
}

export function BrogliaccioRedigenteScenario({ nomeSchema, scenarioId }: Props) {
  const [stato, setStato] = useState<StatoBrogliaccio | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [confronto, setConfronto] = useState<RisultatoConfrontoLiquidatorio | null>(null);

  useDichiaraContestoAssistente({ pagina: 'brogliaccio', nomeSchema, scenarioId });

  const carica = async () => {
    setCaricamento(true);
    const [risultato, risultatoConfronto] = await Promise.all([
      ottieniBrogliaccio(nomeSchema, scenarioId),
      ottieniConfrontoLiquidatorio(nomeSchema, scenarioId),
    ]);
    if (risultato.success) setStato(risultato.stato);
    else setErrore(risultato.error || 'Impossibile caricare il Brogliaccio.');
    setConfronto(risultatoConfronto);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  const handleGenera = async () => {
    setInCorso(true);
    setErrore(null);
    const risultato = await generaBrogliaccioRedigenteAction(nomeSchema, scenarioId);
    if (risultato.success) setStato(risultato.stato);
    else setErrore(risultato.error || 'Impossibile generare il Brogliaccio.');
    // Il confronto liquidatorio parte server-side, silenzioso: lo
    // richiediamo di nuovo per riflettere lo stato aggiornato.
    const risultatoConfronto = await ottieniConfrontoLiquidatorio(nomeSchema, scenarioId);
    setConfronto(risultatoConfronto);
    setInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;
  if (!stato) return null;

  const testo = stato.livello1Testo;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <NotebookText className="w-4 h-4 text-blue-600" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Brogliaccio</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            La sintesi di tutto quanto raccolto fin qui — anagrafica, bilanci e indici, posizione
            aggiornata, Check List, Test pratico, dati di settore e simulazione — come punto di
            partenza per scrivere la Proposta. Nessun dato nuovo: si scrive quando lo generi,
            rigenerarlo lo aggiorna con i dati attuali.
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {confronto && (
        <div
          className={`text-[11px] rounded-lg p-3 border ${
            confronto.testo
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : confronto.errore
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          {confronto.testo ? (
            <>
              Confronto con lo scenario liquidatorio pronto
              {confronto.generatoIl &&
                ` (${new Date(confronto.generatoIl).toLocaleDateString('it-IT')})`}{' '}
              — la Relazione lo userà come pavimento minimo (artt. 63/88 CCII), senza ricerca in
              diretta al lancio.
            </>
          ) : confronto.errore ? (
            <>
              Confronto con lo scenario liquidatorio non riuscito: {confronto.errore} — si riprova
              automaticamente alla prossima generazione del Brogliaccio.
            </>
          ) : (
            'Confronto con lo scenario liquidatorio non ancora generato — parte in automatico generando il Brogliaccio.'
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Sintesi dello scenario
          </h3>
          <button
            type="button"
            onClick={handleGenera}
            disabled={inCorso}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            {inCorso ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {testo ? 'Rigenera' : 'Genera'}
          </button>
        </div>

        {testo ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-end mb-2">
              <button
                type="button"
                onClick={() => stampaTesto('Brogliaccio', testo, stato.livello1GeneratoIl)}
                className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors"
                title="Apre una finestra di stampa — da lì puoi salvare come PDF"
              >
                <Printer className="w-3 h-3" /> Stampa / PDF
              </button>
            </div>
            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{testo}</p>
            {stato.livello1GeneratoIl && (
              <p className="text-[10px] text-slate-400 mt-2">
                Generato il {new Date(stato.livello1GeneratoIl).toLocaleString('it-IT')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Non ancora generato — raccoglie anagrafica, ultimo bilancio XBRL e indici, posizione
            aggiornata, esito della Check List Ministeriale, fascia del Test pratico, dati di
            settore e sostenibilità della simulazione.
          </p>
        )}
      </div>
    </div>
  );
}
