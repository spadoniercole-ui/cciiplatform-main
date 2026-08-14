'use client';

// Check List Ministeriale a livello Azienda — solo Redigente. A
// differenza della Check List generata da Screening per il Ricevente,
// qui le 56 domande sono FISSE (Sezione II del decreto ministeriale),
// organizzate per sezione come nel testo ufficiale. Lo Screening può
// aver già risposto ad alcune (badge "Screening"), il resto va
// completato a mano.

import React, { useEffect, useState } from 'react';
import { ListChecks, CheckCircle2, Sparkles } from 'lucide-react';
import {
  ottieniChecklistMinisterialeAzienda,
  salvaRispostaChecklistMinisterialeAziendaAction,
  type StatoChecklistMinisterialeAzienda,
} from '@/app/actions/checklistMinisterialeAzienda';
import { CHECKLIST_MINISTERIALE } from '@/lib/checklist/ministeriale';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

export function CheckListMinisterialeAziendaScenario({ nomeSchema, aziendaId }: Props) {
  const [stato, setStato] = useState<StatoChecklistMinisterialeAzienda | null>(null);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniChecklistMinisterialeAzienda(nomeSchema, aziendaId);
      if (risultato.success) setStato(risultato.stato);
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  const handleRispondi = async (domandaId: string, risposta: boolean) => {
    if (!stato) return;
    const nuoveRisposte = stato.risposte.filter((r) => r.domandaId !== domandaId);
    nuoveRisposte.push({ domandaId, risposta, note: null, daScreening: false });
    setStato({ ...stato, risposte: nuoveRisposte });
    await salvaRispostaChecklistMinisterialeAziendaAction(
      nomeSchema,
      aziendaId,
      domandaId,
      risposta,
      null
    );
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;
  if (!stato) return <p className="text-xs text-red-600">Impossibile caricare la Check List.</p>;

  const mappaRisposte = new Map(stato.risposte.map((r) => [r.domandaId, r]));
  const totaleDomande = CHECKLIST_MINISTERIALE.reduce((acc, s) => acc + s.domande.length, 0);
  const totaleRisposte = stato.risposte.filter((r) => r.risposta !== null).length;
  const totaleDaScreening = stato.risposte.filter((r) => r.daScreening).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-blue-600" /> Check List Ministeriale
          </h2>
          <p className="text-[11px] text-slate-500 mt-1">
            56 domande fisse (Sezione II del decreto ministeriale) — non generate, la stessa lista
            per ogni azienda. {totaleRisposte}/{totaleDomande} risposte
            {totaleDaScreening > 0 && `, ${totaleDaScreening} già compilate dallo Screening`}.
          </p>
        </div>
      </div>

      {stato.quadro && (
        <div
          className={`border rounded-xl p-4 ${
            stato.quadro.coloreEtichetta === 'verde'
              ? 'bg-emerald-50 border-emerald-200'
              : stato.quadro.coloreEtichetta === 'giallo'
                ? 'bg-amber-50 border-amber-200'
                : stato.quadro.coloreEtichetta === 'rosso'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-slate-50 border-slate-200'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
            Esito
          </span>
          <span className="text-sm font-bold text-slate-900">{stato.quadro.etichetta}</span>
        </div>
      )}

      <div className="space-y-4">
        {CHECKLIST_MINISTERIALE.map((sezione) => {
          const risposteSezione = sezione.domande.filter(
            (d) => mappaRisposte.get(d.id)?.risposta !== undefined
          );
          return (
            <details
              key={sezione.numero}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              open={sezione.numero === '1'}
            >
              <summary className="cursor-pointer p-4 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  {sezione.numero}. {sezione.titolo}
                </span>
                <span className="text-[10px] text-slate-400 font-bold shrink-0 ml-2">
                  {risposteSezione.length}/{sezione.domande.length}
                </span>
              </summary>
              <div className="border-t border-slate-100 divide-y divide-slate-100">
                {sezione.domande.map((domanda) => {
                  const rigaRisposta = mappaRisposte.get(domanda.id);
                  return (
                    <div key={domanda.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-xs text-slate-700">{domanda.domanda}</p>
                        {rigaRisposta?.daScreening && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded mt-1">
                            <Sparkles className="w-2.5 h-2.5" /> Compilata dallo Screening
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRispondi(domanda.id, true)}
                          className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${
                            rigaRisposta?.risposta === true
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          Sì
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRispondi(domanda.id, false)}
                          className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-colors ${
                            rigaRisposta?.risposta === false
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {totaleRisposte === totaleDomande && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Check List completa — pronta per essere ereditata quando crei un nuovo Scenario per questa
          azienda.
        </div>
      )}
    </div>
  );
}
