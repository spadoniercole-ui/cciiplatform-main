'use client';

// Parametri di visualizzazione dello spazio — per ora un solo settaggio:
// quanti anni di storico XBRL mostrare al massimo in Indici multi-periodo
// e Posizione Aggiornata. Parametro PER-SPAZIO con default di sistema;
// l'archivio conserva comunque tutti gli anni, qui si governa solo quanti
// mostrarne a video.

import React, { useEffect, useState } from 'react';
import { History, Sparkles } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  ottieniAnniStoricoMax,
  aggiornaAnniStoricoMaxAction,
  ottieniScreeningMaxTokens,
  aggiornaScreeningMaxTokensAction,
} from '@/app/actions/parametriSpazio';
import {
  MAX_ANNI_STORICO_DEFAULT,
  MIN_ANNI_STORICO,
  MAX_ANNI_STORICO_LIMITE,
} from '@/lib/parametriPeriodi';
import {
  SCREENING_MAX_TOKENS_DEFAULT,
  SCREENING_MAX_TOKENS_MIN,
  SCREENING_MAX_TOKENS_LIMITE,
} from '@/lib/parametriGenerazione';

interface Props {
  nomeSchema: string;
}

export function ParametriVisualizzazioneViewer({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Storico XBRL a video (anni mostrati in Indici e Posizione Aggiornata)',
  });

  const [anni, setAnni] = useState<number>(MAX_ANNI_STORICO_DEFAULT);
  const [usaDefault, setUsaDefault] = useState<boolean>(true);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Tetto token screening (generazione AI)
  const [scrTokens, setScrTokens] = useState<number>(SCREENING_MAX_TOKENS_DEFAULT);
  const [scrUsaDefault, setScrUsaDefault] = useState<boolean>(true);
  const [scrSalvataggio, setScrSalvataggio] = useState(false);
  const [scrSalvato, setScrSalvato] = useState(false);
  const [scrErrore, setScrErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const [risultato, risScreening] = await Promise.all([
        ottieniAnniStoricoMax(nomeSchema),
        ottieniScreeningMaxTokens(nomeSchema),
      ]);
      if (risultato.success) {
        setAnni(risultato.anni);
        setUsaDefault(!risultato.personalizzato);
      } else {
        setErrore(risultato.error || 'Impossibile caricare il parametro.');
      }
      if (risScreening.success) {
        setScrTokens(risScreening.maxTokens);
        setScrUsaDefault(!risScreening.personalizzato);
      }
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const handleSalva = async () => {
    setSalvataggio(true);
    setSalvato(false);
    setErrore(null);
    const risultato = await aggiornaAnniStoricoMaxAction(nomeSchema, usaDefault ? null : anni);
    if (risultato.success) setSalvato(true);
    else setErrore(risultato.error || 'Impossibile salvare.');
    setSalvataggio(false);
  };

  const handleSalvaScreening = async () => {
    setScrSalvataggio(true);
    setScrSalvato(false);
    setScrErrore(null);
    const risultato = await aggiornaScreeningMaxTokensAction(
      nomeSchema,
      scrUsaDefault ? null : scrTokens
    );
    if (risultato.success) setScrSalvato(true);
    else setScrErrore(risultato.error || 'Impossibile salvare.');
    setScrSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Storico XBRL a video
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Quanti anni di bilancio XBRL mostrare al massimo (i più recenti) nella vista Indici
        multi-periodo e nella Posizione Aggiornata. Non tocca l&apos;archivio: tutti gli anni
        caricati restano conservati, qui decidi solo quanti visualizzarne per non appesantire lo
        schermo. Consentito da {MIN_ANNI_STORICO} a {MAX_ANNI_STORICO_LIMITE}; default di sistema{' '}
        {MAX_ANNI_STORICO_DEFAULT}.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={usaDefault}
          onChange={(e) => {
            setUsaDefault(e.target.checked);
            if (e.target.checked) setAnni(MAX_ANNI_STORICO_DEFAULT);
            setSalvato(false);
          }}
        />
        Usa il default di sistema ({MAX_ANNI_STORICO_DEFAULT} anni)
      </label>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Anni mostrati
          </label>
          <input
            type="number"
            min={MIN_ANNI_STORICO}
            max={MAX_ANNI_STORICO_LIMITE}
            value={anni}
            disabled={usaDefault}
            onChange={(e) => {
              const v = Number(e.target.value);
              setAnni(Number.isNaN(v) ? MIN_ANNI_STORICO : v);
              setSalvato(false);
            }}
            className="w-24 p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
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
          Impostazione salvata. Vale per Indici e Posizione Aggiornata di questo spazio.
        </div>
      )}

      {/* Generazione Screening (AI) — tetto token in output */}
      <div className="pt-6 mt-2 border-t border-slate-100 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Generazione Screening (AI)
          </h2>
        </div>
        <p className="text-[11px] text-slate-500">
          Tetto massimo di token in <span className="font-bold">output</span> per il questionario di
          Screening generato dall&apos;AI. Se lo Screening viene troncato a metà (molte direttrici e
          molte domande), alza questo valore. Consentito da {SCREENING_MAX_TOKENS_MIN} a{' '}
          {SCREENING_MAX_TOKENS_LIMITE}; default di sistema {SCREENING_MAX_TOKENS_DEFAULT}.
        </p>

        {scrErrore && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {scrErrore}
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={scrUsaDefault}
            onChange={(e) => {
              setScrUsaDefault(e.target.checked);
              if (e.target.checked) setScrTokens(SCREENING_MAX_TOKENS_DEFAULT);
              setScrSalvato(false);
            }}
          />
          Usa il default di sistema ({SCREENING_MAX_TOKENS_DEFAULT} token)
        </label>

        <div className="flex items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Tetto token output
            </label>
            <input
              type="number"
              min={SCREENING_MAX_TOKENS_MIN}
              max={SCREENING_MAX_TOKENS_LIMITE}
              step={500}
              value={scrTokens}
              disabled={scrUsaDefault}
              onChange={(e) => {
                const v = Number(e.target.value);
                setScrTokens(Number.isNaN(v) ? SCREENING_MAX_TOKENS_MIN : v);
                setScrSalvato(false);
              }}
              className="w-28 p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={handleSalvaScreening}
            disabled={scrSalvataggio}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-[10px] uppercase rounded-lg transition-colors"
          >
            {scrSalvataggio ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>

        {scrSalvato && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            Impostazione salvata. Vale per la generazione dello Screening di questo spazio.
          </div>
        )}
      </div>
    </div>
  );
}
