'use client';

// Peso per singola domanda della Check List Ministeriale — estratto da
// ChecklistPesiManager perché deve stare dietro la scheda "Check List
// Ministeriale", non sempre in vista: 56 domande in linea rendevano
// lunghissima anche solo la pagina di configurazione.

import React, { useEffect, useState } from 'react';
import { RotateCcw, ListChecks } from 'lucide-react';
import {
  ottieniConfigurazioneChecklist,
  aggiornaPesoDomandaAction,
  ripristinaPesoDefaultAction,
  type ConfigurazioneChecklist,
} from '@/app/actions/checklistConfig';
import type { PesoDomanda } from '@/lib/checklist/ministeriale';

const OPZIONI_PESO: PesoDomanda[] = ['STRUTTURALE', 'RILEVANTE', 'DOCUMENTALE'];

interface Props {
  nomeSchema: string;
}

export function ChecklistPesoPerDomandaManager({ nomeSchema }: Props) {
  const [config, setConfig] = useState<ConfigurazioneChecklist | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const risultato = await ottieniConfigurazioneChecklist(nomeSchema);
    if (!risultato.success) {
      setErrore(risultato.error || 'Impossibile caricare la configurazione.');
    } else {
      setConfig(risultato.configurazione || null);
      setErrore(null);
    }
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const handleCambiaPeso = async (domandaId: string, nuovoPeso: PesoDomanda) => {
    await aggiornaPesoDomandaAction(nomeSchema, domandaId, nuovoPeso);
    await carica();
  };

  const handleRipristina = async (domandaId: string) => {
    await ripristinaPesoDefaultAction(nomeSchema, domandaId);
    await carica();
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;
  if (errore || !config) {
    return (
      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        {errore}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
        <ListChecks className="w-4 h-4 text-blue-600" />
        <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Peso per domanda ({config.domandeConOverride.length} personalizzate)
        </h3>
      </div>

      <div className="space-y-6">
        {config.sezioni.map((sezione) => (
          <div key={sezione.numero}>
            <h4 className="text-xs font-bold text-slate-700 mb-2">
              {sezione.numero}. {sezione.titolo}
            </h4>
            <div className="space-y-1.5">
              {sezione.domande.map((domanda) => {
                const personalizzata = config.domandeConOverride.includes(domanda.id);
                return (
                  <div
                    key={domanda.id}
                    className="flex items-center gap-2 text-xs border-b border-slate-50 pb-1.5"
                  >
                    <span className="font-mono text-slate-400 w-10 shrink-0">{domanda.id}</span>
                    <span className="flex-1 text-slate-700 truncate">{domanda.domanda}</span>
                    <select
                      value={domanda.peso}
                      onChange={(e) => handleCambiaPeso(domanda.id, e.target.value as PesoDomanda)}
                      className={`text-[10px] font-bold px-1.5 py-1 rounded border text-slate-900 ${
                        personalizzata ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
                      }`}
                    >
                      {OPZIONI_PESO.map((p) => (
                        <option key={p} value={p} className="text-slate-900 bg-white">
                          {p}
                        </option>
                      ))}
                    </select>
                    {personalizzata && (
                      <button
                        type="button"
                        onClick={() => handleRipristina(domanda.id)}
                        className="text-slate-400 hover:text-blue-600"
                        title="Ripristina il default"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
