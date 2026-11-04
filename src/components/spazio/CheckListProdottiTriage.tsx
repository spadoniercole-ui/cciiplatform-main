'use client';

// LA CHECK LIST DEI PRODOTTI (0.159.0).
//
// Sta nel triage al posto della check list dello screening: quella non si usa
// più come questionario da compilare (resta nel codice come lettura storica,
// non viene più mostrata né letta). Questa nasce dal catalogo delle TL — un
// prodotto, le sue lavorazioni — e si risponde subito prima dell'elaborazione
// del triage.
//
// LA GENERAZIONE NON È OBBLIGATORIA. Se il catalogo ha già le TL, le domande
// di base ci sono anche senza AI; il pulsante le rigenera quando il catalogo
// cambia. Le risposte alle domande rimaste identiche non si perdono.

import React, { useEffect, useState } from 'react';
import { ListChecks, Sparkles, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  generaChecklistProdottiAction,
  ottieniChecklistProdottiAction,
  salvaRispostaChecklistProdottoAction,
  type RisultatoChecklistProdotti,
} from '@/app/actions/checklistProdotti';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

export function CheckListProdottiTriage({ nomeSchema, aziendaId }: Props) {
  const [stato, setStato] = useState<RisultatoChecklistProdotti | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [generazione, setGenerazione] = useState(false);
  const [rispostaInCorso, setRispostaInCorso] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const r = await ottieniChecklistProdottiAction(nomeSchema, aziendaId);
    if (r.success) setStato(r);
    else setErrore(r.error ?? 'Lettura non riuscita.');
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const genera = async () => {
    setGenerazione(true);
    setErrore(null);
    setAvviso(null);
    const r = await generaChecklistProdottiAction(nomeSchema, aziendaId);
    if (r.success) {
      setStato(r);
      setAvviso(
        r.origine === 'AI'
          ? 'Check list generata sui prodotti dell’ente. Le risposte già date alle domande rimaste identiche sono state conservate.'
          : 'Check list generata dal catalogo delle TL: l’assistente non era disponibile, le domande sono quelle di base. Le risposte già date sono state conservate.'
      );
    } else {
      setErrore(r.error ?? 'Generazione non riuscita.');
    }
    setGenerazione(false);
  };

  const rispondi = async (rigaId: number, risposta: boolean) => {
    const corrente = stato?.righe.find((r) => r.id === rigaId)?.risposta;
    const nuovo: boolean | null = corrente === risposta ? null : risposta;
    setRispostaInCorso(rigaId);
    setErrore(null);
    const r = await salvaRispostaChecklistProdottoAction(
      nomeSchema,
      aziendaId,
      rigaId,
      nuovo,
      null
    );
    if (r.success) await carica();
    else setErrore(r.error ?? 'Risposta non salvata.');
    setRispostaInCorso(null);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento della check list…</p>;

  const sintesi = stato?.sintesi;
  const vuota = !stato || stato.righe.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
            <ListChecks className="w-4 h-4 text-slate-500" />
            Check list dei prodotti
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Le domande nascono dal catalogo delle TL dell’ente, prodotto per prodotto: dicono che
            cosa l’azienda ha attivato davanti all’ente, non che cosa dicono i documenti. Si
            compilano qui, subito prima dell’elaborazione del triage. Un «Sì» è sempre la buona
            notizia.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {sintesi && sintesi.totale > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {sintesi.risposte}/{sintesi.totale} risposte
              {sintesi.criticita > 0 ? ` · ${sintesi.criticita} criticità` : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => void genera()}
            disabled={generazione}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 disabled:bg-slate-100 text-slate-700 font-bold uppercase tracking-wider rounded-lg text-[10px]"
          >
            {generazione ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {generazione
              ? 'Generazione…'
              : vuota
                ? 'Genera la check list'
                : 'Rigenera dal catalogo'}
          </button>
        </div>
      </div>

      {errore && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{errore}</span>
        </p>
      )}
      {avviso && (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{avviso}</span>
        </p>
      )}

      {vuota ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="text-xs text-slate-600 leading-relaxed">
            Per questa azienda la check list dei prodotti non è ancora stata generata. Le domande
            vengono dal catalogo delle TL configurato dall’ente: se il catalogo è vuoto, prima vanno
            impostate le direttrici e i loro prodotti.
          </p>
          <p className="text-[10px] text-slate-400">
            Il catalogo si configura in Parametri di Spazio → Direttrici e prodotti.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sintesi?.sezioni.map((sezione) => (
            <div
              key={sezione.prodotto}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-2"
            >
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <h4 className="font-bold text-slate-900 text-xs">
                  {sezione.prodotto}
                  {sezione.direttrice && (
                    <span className="font-normal text-slate-400"> — {sezione.direttrice}</span>
                  )}
                </h4>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {sezione.risposte}/{sezione.totale}
                  {sezione.criticita > 0 ? ` · ${sezione.criticita} da approfondire` : ''}
                </span>
              </div>
              <div className="space-y-2">
                {sezione.righe.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-b border-slate-50 pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-xs text-slate-700 flex-1">{r.domanda}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void rispondi(r.id, true)}
                        disabled={rispostaInCorso === r.id}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase disabled:opacity-50 ${
                          r.risposta === true
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        Sì
                      </button>
                      <button
                        type="button"
                        onClick={() => void rispondi(r.id, false)}
                        disabled={rispostaInCorso === r.id}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase disabled:opacity-50 ${
                          r.risposta === false
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {sintesi && !sintesi.completa ? (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
              Restano {sintesi.senzaRisposta.length}{' '}
              {sintesi.senzaRisposta.length === 1
                ? 'domanda senza risposta'
                : 'domande senza risposta'}
              . Una domanda senza risposta non è un «no»: è una verifica non ancora compiuta, e il
              report la stampa come tale.
            </p>
          ) : (
            sintesi &&
            sintesi.totale > 0 && (
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Tutte le domande hanno una risposta.
              </p>
            )
          )}
        </div>
      )}
    </div>
  );
}
