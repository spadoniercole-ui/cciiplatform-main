'use client';

import React, { useEffect, useState } from 'react';
import { NotebookText, Sparkles, RefreshCw, Lock, Printer } from 'lucide-react';
import {
  ottieniBrogliaccio,
  generaLivello1BrogliaccioAction,
  generaLivello2BrogliaccioAction,
  generaLivello3BrogliaccioAction,
  impostaVarcoBrogliaccioAction,
  type StatoBrogliaccio,
} from '@/app/actions/brogliaccio';
import {
  ottieniConfrontoLiquidatorio,
  type RisultatoConfrontoLiquidatorio,
} from '@/app/actions/confrontoLiquidatorio';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { stampaTesto } from '@/lib/stampaTesto';

interface Props {
  nomeSchema: string;
  scenarioId: number;
  plusDatiSettore: boolean;
  plusSimulazione: boolean;
}

function BloccoTesto({
  testo,
  generatoIl,
  titolo,
}: {
  testo: string;
  generatoIl: string | null;
  titolo: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => stampaTesto(titolo, testo, generatoIl)}
          className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[9px] uppercase rounded transition-colors"
          title="Apre una finestra di stampa — da lì puoi salvare come PDF"
        >
          <Printer className="w-3 h-3" /> Stampa / PDF
        </button>
      </div>
      <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{testo}</p>
      {generatoIl && (
        <p className="text-[10px] text-slate-400 mt-2">
          Generato il {new Date(generatoIl).toLocaleString('it-IT')}
        </p>
      )}
    </div>
  );
}

export function BrogliaccioEnteScenario({
  nomeSchema,
  scenarioId,
  plusDatiSettore,
  plusSimulazione,
}: Props) {
  const [stato, setStato] = useState<StatoBrogliaccio | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [azioneInCorso, setAzioneInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [confrontoLiquidatorio, setConfrontoLiquidatorio] =
    useState<RisultatoConfrontoLiquidatorio | null>(null);

  useDichiaraContestoAssistente({ pagina: 'brogliaccio', nomeSchema, scenarioId });

  const carica = async () => {
    setCaricamento(true);
    const [risultato, risultatoConfronto] = await Promise.all([
      ottieniBrogliaccio(nomeSchema, scenarioId),
      ottieniConfrontoLiquidatorio(nomeSchema, scenarioId),
    ]);
    if (risultato.success) setStato(risultato.stato);
    else setErrore(risultato.error || 'Impossibile caricare il Brogliaccio.');
    setConfrontoLiquidatorio(risultatoConfronto);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  const handleGenera = async (
    azione: () => Promise<{ success: boolean; stato: StatoBrogliaccio; error?: string }>,
    etichetta: string
  ) => {
    setAzioneInCorso(etichetta);
    setErrore(null);
    const risultato = await azione();
    if (risultato.success) setStato(risultato.stato);
    else setErrore(risultato.error || 'Impossibile generare.');
    // Il trigger del confronto liquidatorio è server-side, silenzioso —
    // il client non lo sa finché non lo richiede di nuovo.
    const risultatoConfronto = await ottieniConfrontoLiquidatorio(nomeSchema, scenarioId);
    setConfrontoLiquidatorio(risultatoConfronto);
    setAzioneInCorso(null);
  };

  const handleVarco = async (livello: 2 | 3, richiesto: boolean) => {
    setAzioneInCorso(`varco-${livello}`);
    const risultato = await impostaVarcoBrogliaccioAction(
      nomeSchema,
      scenarioId,
      livello,
      richiesto
    );
    if (risultato.success) await carica();
    else setErrore(risultato.error || 'Impossibile salvare la scelta.');
    setAzioneInCorso(null);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;
  if (!stato) return null;

  const gruppoPlusOk3 = plusDatiSettore || plusSimulazione;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <NotebookText className="w-4 h-4 text-blue-600" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Brogliaccio</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Un livello alla volta — il testo si scrive quando lo generi, non automaticamente ad ogni
            modifica altrove. Rigenerare un livello lo sovrascrive con i dati attuali.
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {confrontoLiquidatorio && (
        <div
          className={`text-[11px] rounded-lg p-3 border ${
            confrontoLiquidatorio.testo
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : confrontoLiquidatorio.errore
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          {confrontoLiquidatorio.testo ? (
            <>
              Confronto con lo scenario liquidatorio pronto
              {confrontoLiquidatorio.generatoIl &&
                ` (${new Date(confrontoLiquidatorio.generatoIl).toLocaleDateString('it-IT')})`}{' '}
              — la Relazione lo userà automaticamente, nessuna ricerca in diretta al lancio.
            </>
          ) : confrontoLiquidatorio.errore ? (
            <>
              Confronto con lo scenario liquidatorio non riuscito: {confrontoLiquidatorio.errore} —
              si riprova automaticamente al prossimo livello generato.
            </>
          ) : (
            'Confronto con lo scenario liquidatorio non ancora generato — parte in automatico generando un livello del Brogliaccio.'
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Livello 1 — Posizione Ente e Proposta
          </h3>
          <button
            type="button"
            onClick={() =>
              handleGenera(() => generaLivello1BrogliaccioAction(nomeSchema, scenarioId), 'l1')
            }
            disabled={azioneInCorso === 'l1'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            {azioneInCorso === 'l1' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {stato.livello1Testo ? 'Rigenera' : 'Genera'}
          </button>
        </div>
        {stato.livello1Testo ? (
          <BloccoTesto
            testo={stato.livello1Testo}
            generatoIl={stato.livello1GeneratoIl}
            titolo="Brogliaccio — Livello 1"
          />
        ) : (
          <p className="text-xs text-slate-400">
            Non ancora generato — raccoglie Anagrafica Ente, Check List, Situazione Debitoria e
            l&apos;esito di ricevibilità della riga rilevante della Proposta.
          </p>
        )}
      </div>

      {stato.livello1Testo && (
        <div className="border border-dashed border-blue-300 bg-blue-50/50 rounded-xl p-4">
          <p className="text-xs text-blue-900 mb-2">
            Vuoi procedere alla verifica dei bilanci e della situazione attuale dell&apos;azienda?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleVarco(2, true)}
              disabled={azioneInCorso === 'varco-2' || stato.livello2Richiesto}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              Sì, procedi
            </button>
            {stato.livello2Richiesto && (
              <button
                type="button"
                onClick={() => handleVarco(2, false)}
                disabled={azioneInCorso === 'varco-2'}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 font-bold text-[10px] uppercase rounded-lg transition-colors"
              >
                No, fermati qui
              </button>
            )}
          </div>
        </div>
      )}

      {stato.livello2Richiesto && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Livello 2 — XBRL e Indici
            </h3>
            <button
              type="button"
              onClick={() =>
                handleGenera(() => generaLivello2BrogliaccioAction(nomeSchema, scenarioId), 'l2')
              }
              disabled={azioneInCorso === 'l2'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              {azioneInCorso === 'l2' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {stato.livello2Testo ? 'Rigenera' : 'Genera'}
            </button>
          </div>
          {stato.livello2Testo ? (
            <BloccoTesto
              testo={stato.livello2Testo}
              generatoIl={stato.livello2GeneratoIl}
              titolo="Brogliaccio — Livello 2"
            />
          ) : (
            <p className="text-xs text-slate-400">
              Non ancora generato — raccoglie l&apos;ultimo bilancio XBRL, gli indici CCII e la
              Posizione Aggiornata.
            </p>
          )}
        </div>
      )}

      {stato.livello2Testo && (
        <div className="border border-dashed border-blue-300 bg-blue-50/50 rounded-xl p-4">
          {!gruppoPlusOk3 ? (
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <Lock className="w-4 h-4 shrink-0 mt-0.5" />
              <p>
                Il livello 3 (Dati di Settore e Simulazione) richiede che almeno una di queste
                funzioni plus sia attiva per questo spazio — chiedi al superadmin di abilitarle
                sulla licenza, se servono qui.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-blue-900 mb-2">
                Gli indici suggeriscono spazi di manovra da esplorare — vuoi simulare la solidità
                della proposta?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleVarco(3, true)}
                  disabled={azioneInCorso === 'varco-3' || stato.livello3Richiesto}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
                >
                  Sì, procedi
                </button>
                {stato.livello3Richiesto && (
                  <button
                    type="button"
                    onClick={() => handleVarco(3, false)}
                    disabled={azioneInCorso === 'varco-3'}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 font-bold text-[10px] uppercase rounded-lg transition-colors"
                  >
                    No, fermati qui
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {stato.livello3Richiesto && gruppoPlusOk3 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Livello 3 — Dati di Settore e Simulazione
            </h3>
            <button
              type="button"
              onClick={() =>
                handleGenera(() => generaLivello3BrogliaccioAction(nomeSchema, scenarioId), 'l3')
              }
              disabled={azioneInCorso === 'l3'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
            >
              {azioneInCorso === 'l3' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {stato.livello3Testo ? 'Rigenera' : 'Genera'}
            </button>
          </div>
          {stato.livello3Testo ? (
            <BloccoTesto
              testo={stato.livello3Testo}
              generatoIl={stato.livello3GeneratoIl}
              titolo="Brogliaccio — Livello 3"
            />
          ) : (
            <p className="text-xs text-slate-400">
              Non ancora generato — raccoglie il confronto con il settore ISTAT e l&apos;analisi dei
              documenti allegati alla proposta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
