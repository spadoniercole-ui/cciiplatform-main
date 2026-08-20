'use client';

// Parametri di visualizzazione dello spazio — per ora un solo settaggio:
// quanti anni di storico XBRL mostrare al massimo in Indici multi-periodo
// e Posizione Aggiornata. Parametro PER-SPAZIO con default di sistema;
// l'archivio conserva comunque tutti gli anni, qui si governa solo quanti
// mostrarne a video.

import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { ottieniAnniStoricoMax, aggiornaAnniStoricoMaxAction } from '@/app/actions/parametriSpazio';
import {
  MAX_ANNI_STORICO_DEFAULT,
  MIN_ANNI_STORICO,
  MAX_ANNI_STORICO_LIMITE,
} from '@/lib/parametriPeriodi';

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

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniAnniStoricoMax(nomeSchema);
      if (risultato.success) {
        setAnni(risultato.anni);
        setUsaDefault(!risultato.personalizzato);
      } else {
        setErrore(risultato.error || 'Impossibile caricare il parametro.');
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
    </div>
  );
}
