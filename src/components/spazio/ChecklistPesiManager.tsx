'use client';

// Valori numerici e soglie della Check List — condivisi tra Ministeriale
// e modelli custom (stesso motore di punteggio), per questo restano
// sempre visibili, non dietro una scheda. Il peso per singola domanda
// (specifico della Ministeriale) è in ChecklistPesoPerDomandaManager.

import React, { useEffect, useState } from 'react';
import { Settings2, HelpCircle, X } from 'lucide-react';
import {
  ottieniConfigurazioneChecklist,
  aggiornaParametroNumericoAction,
  type ConfigurazioneChecklist,
} from '@/app/actions/checklistConfig';

interface Props {
  nomeSchema: string;
}

export function ChecklistPesiManager({ nomeSchema }: Props) {
  const [config, setConfig] = useState<ConfigurazioneChecklist | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [mostraLegenda, setMostraLegenda] = useState(false);

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

  const handleCambiaNumerico = async (
    chiave:
      | 'PESO_STRUTTURALE'
      | 'PESO_RILEVANTE'
      | 'PESO_DOCUMENTALE'
      | 'SOGLIA_SOLIDO'
      | 'SOGLIA_DA_RAFFORZARE',
    valore: number
  ) => {
    await aggiornaParametroNumericoAction(nomeSchema, chiave, valore);
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
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Check List — pesi e soglie
          </h2>
          <p className="text-slate-500 text-[11px] mt-1">
            Governo dei pesi (Strutturale/Rilevante/Documentale) usati dal quadro qualitativo pesato
            in questo spazio — valgono sia per la Ministeriale sia per i modelli custom. Sono un
            default ragionevole, non un dato normativo: rivedibili qui.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMostraLegenda(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] uppercase tracking-wider rounded-lg transition-colors shrink-0"
        >
          <HelpCircle className="w-3.5 h-3.5" /> Come funziona
        </button>
      </div>

      {mostraLegenda && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 relative">
            <button
              type="button"
              onClick={() => setMostraLegenda(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-slate-900 text-sm">
              Come funziona il peso delle domande
            </h2>
            <div className="space-y-3 text-xs text-slate-700">
              <p>
                Ogni domanda della Check List ha un peso, che indica quanto un &quot;No&quot;
                influisce sul quadro finale dello scenario:
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-700 shrink-0 mt-0.5">
                    Strutturale
                  </span>
                  <p>
                    Un &quot;No&quot; qui mette in dubbio la tenuta stessa del piano (es. valore di
                    liquidazione calcolato con il criterio sbagliato, debito da servire non
                    quantificato). Compare anche nell&apos;elenco separato delle &quot;criticità
                    strutturali aperte&quot;.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0 mt-0.5">
                    Rilevante
                  </span>
                  <p>
                    Un &quot;No&quot; indebolisce il piano ma non lo invalida da solo (es.
                    monitoraggio KPI non ancora attivato).
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0 mt-0.5">
                    Documentale
                  </span>
                  <p>
                    Buona pratica di supporto: un &quot;No&quot; segnala una lacuna documentale più
                    che un rischio sostanziale (es. prospetto dettagliato del magazzino).
                  </p>
                </div>
              </div>
              <p>
                Il quadro finale è calcolato così: si sommano i pesi delle domande già risposte con
                &quot;No&quot;, si divide per la somma dei pesi di tutte le domande già risposte (Sì
                o No), e il risultato è la <strong>percentuale di criticità</strong>. Sotto la
                soglia &quot;Solido&quot; il piano è etichettato solido; tra le due soglie, da
                rafforzare; sopra la seconda soglia, criticità rilevanti. Spostare una domanda da
                Documentale a Strutturale la rende molto più incisiva su questo calcolo — usalo con
                cautela, e sempre con il confronto di un professionista prima di un uso reale verso
                terzi.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <Settings2 className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Valori numerici e soglie
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Peso Strutturale
            </label>
            <input
              type="number"
              defaultValue={config.pesiNumerici.STRUTTURALE}
              onBlur={(e) => handleCambiaNumerico('PESO_STRUTTURALE', Number(e.target.value))}
              className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Peso Rilevante
            </label>
            <input
              type="number"
              defaultValue={config.pesiNumerici.RILEVANTE}
              onBlur={(e) => handleCambiaNumerico('PESO_RILEVANTE', Number(e.target.value))}
              className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Peso Documentale
            </label>
            <input
              type="number"
              defaultValue={config.pesiNumerici.DOCUMENTALE}
              onBlur={(e) => handleCambiaNumerico('PESO_DOCUMENTALE', Number(e.target.value))}
              className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Soglia &quot;Solido&quot; (%)
            </label>
            <input
              type="number"
              defaultValue={config.soglie.solido}
              onBlur={(e) => handleCambiaNumerico('SOGLIA_SOLIDO', Number(e.target.value))}
              className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Soglia &quot;Da rafforzare&quot; (%)
            </label>
            <input
              type="number"
              defaultValue={config.soglie.daRafforzare}
              onBlur={(e) => handleCambiaNumerico('SOGLIA_DA_RAFFORZARE', Number(e.target.value))}
              className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
