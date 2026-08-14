'use client';

// Solo Redigente — non una soglia che decide l'ente ricevente, ma la
// percentuale di base da cui parte una nuova riga quando si compila
// una Proposta: modificabile poi riga per riga quando si sa che un
// creditore specifico si aspetta una percentuale diversa (es. INPS al
// 100% mentre la media resta al 30%).

import React, { useEffect, useState } from 'react';
import { Percent } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  ottieniPercentualeMediaProposta,
  aggiornaPercentualeMediaPropostaAction,
} from '@/app/actions/parametriSpazio';

interface Props {
  nomeSchema: string;
}

export function PercentualeMediaPropostaManager({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Percentuale media di proposta',
  });
  const [percentuale, setPercentuale] = useState(30);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniPercentualeMediaProposta(nomeSchema);
      if (risultato.success) setPercentuale(risultato.percentuale);
      else setErrore(risultato.error || 'Impossibile caricare il parametro.');
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const handleSalva = async () => {
    setSalvataggio(true);
    setErrore(null);
    setSalvato(false);
    const risultato = await aggiornaPercentualeMediaPropostaAction(nomeSchema, percentuale);
    if (!risultato.success) setErrore(risultato.error || 'Impossibile salvare.');
    else setSalvato(true);
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Percent className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Percentuale media di proposta
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Non una soglia — quella la decide l&apos;ente che riceve, non chi scrive la proposta. Qui
        indichi solo il punto di partenza: ogni nuova riga aggiunta in Proposta parte già compilata
        con questa percentuale, e resta libera da modificare riga per riga quando sai che un
        creditore specifico si aspetta un valore diverso (es. INPS al 100% mentre la media resta al
        30%).
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="flex items-end gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
            Percentuale di base
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={percentuale}
              onChange={(e) => {
                setPercentuale(Number(e.target.value));
                setSalvato(false);
              }}
              className="w-24 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <span className="text-sm text-slate-500">%</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSalva}
          disabled={salvataggio}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
        >
          {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
        {salvato && <span className="text-[11px] text-emerald-600 font-bold">Salvato.</span>}
      </div>
    </div>
  );
}
