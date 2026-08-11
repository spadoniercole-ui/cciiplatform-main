'use client';

import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Save, RefreshCw } from 'lucide-react';
import { ottieniInputSimulazione, salvaLeveSimulazioneAction } from '@/app/actions/simulazione';
import {
  LEVE_VUOTE,
  type LeveSimulazione,
  type RisultatoSimulazione,
} from '@/lib/simulazione/calcolo';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';

interface Props {
  nomeSchema: string;
  scenarioId: number;
}

const ICONA_SCENARIO = {
  ottimistico: TrendingUp,
  neutrale: Minus,
  pessimistico: TrendingDown,
};

const ETICHETTA_SCENARIO = {
  ottimistico: 'Ottimistico',
  neutrale: 'Neutrale',
  pessimistico: 'Pessimistico',
};

function formatEuro(v: number): string {
  return v.toLocaleString('it-IT', { maximumFractionDigits: 0 });
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function SimulazioneScenario({ nomeSchema, scenarioId }: Props) {
  const [risultato, setRisultato] = useState<RisultatoSimulazione | null>(null);
  const [leve, setLeve] = useState<LeveSimulazione>(LEVE_VUOTE);
  const [numeroPuntiStorici, setNumeroPuntiStorici] = useState(0);
  const [mesiCopertiPosizioneAggiornata, setMesiCopertiPosizioneAggiornata] = useState<
    number | null
  >(null);
  const [posizioneAggiornataSenzaData, setPosizioneAggiornataSenzaData] = useState(false);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useDichiaraContestoAssistente({ pagina: 'simulazione', nomeSchema, scenarioId });

  const carica = async () => {
    setCaricamento(true);
    const risultatoRis = await ottieniInputSimulazione(nomeSchema, scenarioId);
    if (risultatoRis.success && risultatoRis.risultato) {
      setRisultato(risultatoRis.risultato);
      setLeve(risultatoRis.leve);
      setErrore(null);
    } else {
      setErrore(risultatoRis.error || 'Impossibile calcolare la simulazione.');
    }
    setNumeroPuntiStorici(risultatoRis.numeroPuntiStorici);
    setMesiCopertiPosizioneAggiornata(risultatoRis.mesiCopertiPosizioneAggiornata);
    setPosizioneAggiornataSenzaData(risultatoRis.posizioneAggiornataSenzaData);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, scenarioId]);

  const handleSalva = async () => {
    setSalvataggio(true);
    const esito = await salvaLeveSimulazioneAction(nomeSchema, scenarioId, leve);
    if (esito.success) {
      await carica();
    } else {
      setErrore(esito.error || 'Impossibile salvare le leve.');
    }
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">Simulazione</h2>
        <p className="text-[11px] text-slate-500 mt-1">
          Tre scenari di crescita ricavi a 3 anni, ancorati al confronto tra il trend storico
          dell&apos;azienda e il trend storico del settore (Dati di Settore ISTAT) — non percentuali
          arbitrarie. Il calcolo è sempre deterministico, non generato dall&apos;AI.
        </p>
      </div>

      {errore && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{errore}</p>
        </div>
      )}

      {risultato && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">
              Base storica usata
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">
                  Crescita storica azienda
                </span>
                <span className="font-bold text-slate-900">
                  {risultato.crescitaStoricaAzienda !== null
                    ? formatPct(risultato.crescitaStoricaAzienda)
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">
                  Crescita storica settore
                </span>
                <span className="font-bold text-slate-900">
                  {risultato.crescitaStoricaSettore !== null
                    ? formatPct(risultato.crescitaStoricaSettore)
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">
                  Margine EBITDA storico
                </span>
                <span className="font-bold text-slate-900">
                  {formatPct(risultato.margineEbitdaStorico)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Punti storici</span>
                <span className="font-bold text-slate-900">{numeroPuntiStorici} / 3</span>
              </div>
            </div>
            {risultato.scartoUsatoDiDefault && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3">
                Dati di Settore non disponibili per questa azienda — l&apos;ampiezza tra gli scenari
                usa un valore di default (±3 punti percentuali), non il confronto reale con il
                settore. Aggiornali in Dati di Settore per un risultato più specifico.
              </p>
            )}
            {risultato.ampiezzaLimitata && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3">
                Lo scarto storico misurato tra azienda e settore superava il tetto massimo impostato
                (15 punti percentuali) ed è stato limitato — un&apos;azienda con un trend storico
                già estremo non deve generare scenari altrettanto estremi, sarebbe più fuorviante
                che informativo.
              </p>
            )}
            {mesiCopertiPosizioneAggiornata !== null && mesiCopertiPosizioneAggiornata < 12 && (
              <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-3">
                La Posizione Aggiornata copre {mesiCopertiPosizioneAggiornata}{' '}
                {mesiCopertiPosizioneAggiornata === 1 ? 'mese' : 'mesi'} — i valori sono stati
                annualizzati (moltiplicati per 12/{mesiCopertiPosizioneAggiornata}) prima di
                calcolare la crescita storica, per non confrontare un periodo parziale con un anno
                intero.
              </p>
            )}
            {posizioneAggiornataSenzaData && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-3">
                La Posizione Aggiornata non ha una data di riferimento compilata — è stata usata
                così com&apos;è, senza poter verificare se copre un anno intero o un periodo
                parziale. Compila la data in Posizione Aggiornata per un calcolo più affidabile.
              </p>
            )}
            {risultato.crescitaManualeUsata && (
              <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-3">
                Crescita ricavi imputata manualmente ({formatPct(leve.crescitaRicaviManuale || 0)}
                /anno) — non quella derivata dal trend storico. Svuota il campo nelle Leve per
                tornare al calcolo automatico.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider mb-3">Leve</h3>
            <p className="text-[11px] text-slate-500 mb-3">
              Riduzione costi e riduzione personale agiscono sulla stessa base di calcolo — il
              bilancio XBRL non isola una voce di costo del personale separata, quindi la somma
              delle due non può ridurre i costi operativi oltre il 100%.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Riduzione costi operativi (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={leve.riduzioneCostiPct}
                  onChange={(e) => setLeve({ ...leve, riduzioneCostiPct: Number(e.target.value) })}
                  className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Riduzione costo personale (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={leve.riduzionePersonalePct}
                  onChange={(e) =>
                    setLeve({ ...leve, riduzionePersonalePct: Number(e.target.value) })
                  }
                  className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Allungamento piano (mesi)
                </label>
                <input
                  type="number"
                  min={0}
                  value={leve.mesiAllungamentoRate}
                  onChange={(e) =>
                    setLeve({ ...leve, mesiAllungamentoRate: Number(e.target.value) })
                  }
                  className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {risultato && (risultato.mesiBaseMin !== null || risultato.mesiBaseMax !== null)
                    ? risultato.mesiBaseMin === risultato.mesiBaseMax
                      ? `Base del piano in Proposta: ${risultato.mesiBaseMin} mesi — questi si sommano.`
                      : `Base del piano in Proposta: da ${risultato.mesiBaseMin} a ${risultato.mesiBaseMax} mesi a seconda della riga — questi si sommano a ciascuna.`
                    : 'Nessuna riga a rate nella Proposta: questa leva non ha effetto.'}
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Crescita ricavi (%/anno) — sostituisce lo storico
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={
                    leve.crescitaRicaviManuale !== null && leve.crescitaRicaviManuale !== undefined
                      ? (leve.crescitaRicaviManuale * 100).toFixed(1)
                      : ''
                  }
                  onChange={(e) => {
                    const testo = e.target.value;
                    setLeve({
                      ...leve,
                      crescitaRicaviManuale: testo === '' ? null : Number(testo) / 100,
                    });
                  }}
                  placeholder="usa lo storico"
                  className="w-full p-2 text-sm border border-slate-200 rounded-lg text-slate-900 bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Vuoto = usa il trend storico calcolato. 0 = ricavi fermi. Un valore qui
                  sostituisce la crescita storica come base per tutti e tre gli scenari.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSalva}
              disabled={salvataggio}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
            >
              {salvataggio ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {salvataggio ? 'Ricalcolo...' : 'Salva e ricalcola'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {risultato.scenari.map((scenario) => {
              const Icona = ICONA_SCENARIO[scenario.nome];
              return (
                <div
                  key={scenario.nome}
                  className={`border rounded-xl p-4 ${
                    scenario.viabile
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icona
                      className={`w-4 h-4 ${scenario.viabile ? 'text-emerald-600' : 'text-red-600'}`}
                    />
                    <span className="font-bold text-slate-900 text-xs uppercase">
                      {ETICHETTA_SCENARIO[scenario.nome]}
                    </span>
                    <span
                      className={`ml-auto text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                        scenario.viabile ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                      }`}
                    >
                      {scenario.viabile ? 'Viabile' : 'Non viabile'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mb-3">
                    Crescita ricavi ipotizzata: {formatPct(scenario.tassoCrescitaRicavi)}/anno
                  </p>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[9px] uppercase text-slate-400 font-bold border-b border-slate-200">
                        <th className="text-left py-1">Anno</th>
                        <th className="text-right py-1">Flusso disp.</th>
                        <th className="text-right py-1">Rata</th>
                        <th className="text-right py-1">DSCR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.anni.map((anno) => (
                        <tr key={anno.anno} className="border-b border-slate-100 last:border-0">
                          <td className="py-1 font-bold text-slate-700">{anno.anno}</td>
                          <td className="py-1 text-right text-slate-700">
                            € {formatEuro(anno.flussoDisponibile)}
                          </td>
                          <td className="py-1 text-right text-slate-700">
                            € {formatEuro(anno.rataAnno)}
                          </td>
                          <td
                            className={`py-1 text-right font-bold ${
                              anno.dscr === null
                                ? 'text-slate-400'
                                : anno.dscr >= 1
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                            }`}
                          >
                            {anno.dscr !== null ? anno.dscr.toFixed(2) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] text-slate-400">
            Flusso disponibile stimato come EBITDA proiettato meno un&apos;imposta forfettaria del
            24% (semplificazione dichiarata — non un dato normativo, non un calcolo fiscale
            completo). DSCR = flusso disponibile / rata del piano di rientro; viabile solo se ≥ 1 in
            tutti e 3 gli anni.
          </p>
        </>
      )}
    </div>
  );
}
