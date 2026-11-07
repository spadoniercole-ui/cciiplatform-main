'use client';

// LA CHECK LIST DEI PRODOTTI NEL TRIAGE (0.161.0).
//
// Il triage, appena acquisiti visura e prospetti e dichiarato se l'azienda ha
// lavoratori, va in stand-by: non è finito, deve ancora chiedere le domande che
// l'ente ha scritto sui prodotti con il flag attivo. Non un questionario
// generico: una domanda comparsa in configurazione è una domanda che si vede
// qui, con la sua forma — chiusa Sì/No oppure testo libero entro il tetto
// scelto.
//
// LA CHECK LIST È UNA QUALIFICAZIONE. Le risposte non misurano il debito (lo
// fanno le soglie, con gli importi): dicono se la storia dell'azienda racconta
// un'azione voluta o uno squilibrio. Per questo il quadro finale non è un
// punteggio, è una lettura: sistemica, da approfondire, oppure squilibrio da
// portare a un tavolo di trattativa.
//
// SENZA DOMANDE NON SI BLOCCA NULLA. Se nessun prodotto è in check list,
// l'elenco è vuoto e il blocco lo dice: un triage fermo su un questionario che
// non esiste sarebbe un vicolo cieco.
//
// UNA DOMANDA SENZA RISPOSTA NON È UN «NO». Resta «senza risposta», e il
// pulsante «Procedi» del triage non si accende finché ne manca una: la
// differenza fra «non risulta» e «non ho ancora guardato» è l'unica cosa che il
// triage non può perdere.

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CircleDot,
  ListChecks,
  RefreshCw,
  ShieldQuestion,
} from 'lucide-react';
import {
  ottieniChecklistProdottiAction,
  salvaRispostaProdottoAction,
  type StatoChecklistProdotti,
} from '@/app/actions/checklistProdottiTriage';
import type { SintesiChecklistProdotti } from '@/lib/prodotti/prodotti';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  /** Il quadro aggiornato: il triage lo usa per calcolare l'esito e per «Procedi». */
  onEsito?: (sintesi: SintesiChecklistProdotti | null) => void;
}

/** Le domande raggruppate per prodotto, nell'ordine in cui sono configurate. */
function perProdotto(voci: StatoChecklistProdotti['voci']) {
  const gruppi = new Map<string, StatoChecklistProdotti['voci']>();
  for (const v of voci) {
    const chiave = `${v.prodottoId}|${v.prodotto}|${v.direttrice}`;
    gruppi.set(chiave, [...(gruppi.get(chiave) ?? []), v]);
  }
  return Array.from(gruppi.entries()).map(([chiave, domande]) => ({
    chiave,
    prodotto: domande[0].prodotto,
    direttrice: domande[0].direttrice,
    domande,
  }));
}

export function ChecklistProdottiTriage({ nomeSchema, aziendaId, onEsito }: Props) {
  const [stato, setStato] = useState<StatoChecklistProdotti | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  /** Il testo libero in scrittura, per (prodotto, domanda). */
  const [bozzeTesto, setBozzeTesto] = useState<Record<string, string>>({});

  const applica = (nuovo: StatoChecklistProdotti) => {
    setStato(nuovo);
    onEsito?.(nuovo.sintesi);
  };

  const carica = async () => {
    setCaricamento(true);
    const r = await ottieniChecklistProdottiAction(nomeSchema, aziendaId);
    if (r.success) applica(r.stato);
    else setErrore(r.error ?? 'Lettura non riuscita.');
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const risposta = (prodottoId: number, domandaId: string) =>
    stato?.risposte.find((r) => r.prodottoId === prodottoId && r.domandaId === domandaId);

  const salva = async (
    prodottoId: number,
    domandaId: string,
    siNo: boolean | null,
    testo: string | null
  ) => {
    const chiave = `${prodottoId}|${domandaId}`;
    setInCorso(chiave);
    setErrore(null);
    const r = await salvaRispostaProdottoAction(
      nomeSchema,
      aziendaId,
      prodottoId,
      domandaId,
      siNo,
      testo
    );
    if (r.success && r.stato) applica(r.stato);
    else setErrore(r.error ?? 'Risposta non salvata.');
    setInCorso(null);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento della check list…</p>;

  const voci = stato?.voci ?? [];
  const sintesi = stato?.sintesi ?? null;
  const gruppi = perProdotto(voci);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <ListChecks className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Check list dei prodotti
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Le domande scritte sui prodotti con il flag attivo. Servono a qualificare l’operato
            dell’azienda: se la sua storia racconta un’azione sistemica o uno squilibrio da aprire a
            un tavolo di trattativa. Le soglie misurano gli importi; questa check dice che cosa
            l’azienda ha fatto (o non ha fatto).
          </p>
        </div>
      </div>

      {errore && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{errore}</span>
        </p>
      )}

      {voci.length === 0 ? (
        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
          Nessun prodotto è in check list: la verifica non ha domande da porre e il triage non si
          ferma. Il flag si accende in{' '}
          <span className="font-bold">Parametri › Prodotti dell’ente</span>.
        </p>
      ) : (
        <>
          {/* LO STAND-BY: il sistema ha acquisito i documenti e attende le risposte. */}
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 ${
              sintesi && sintesi.mancanti > 0
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {sintesi && sintesi.mancanti > 0 ? (
              <ShieldQuestion className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <p className="text-[11px] leading-relaxed">
              {sintesi && sintesi.mancanti > 0 ? (
                <>
                  <span className="font-bold">Documenti acquisiti — il sistema è in stand-by.</span>{' '}
                  {sintesi.mancanti === 1
                    ? 'Resta una domanda senza risposta'
                    : `Restano ${sintesi.mancanti} domande senza risposta`}
                  : l’elaborazione delle soglie e l’esito restano qualificati da queste risposte, e
                  il passaggio alla presa in carico non si chiude finché mancano.
                </>
              ) : (
                <>
                  <span className="font-bold">Check list completa.</span> Le risposte entrano nel
                  quadro di valutazione insieme alla visura e ai prospetti.
                </>
              )}
            </p>
          </div>

          {gruppi.map((g) => (
            <div
              key={g.chiave}
              className="rounded-xl border border-slate-200 bg-white p-4 space-y-2"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <h4 className="font-bold text-slate-900 text-xs">{g.prodotto}</h4>
                <span className="text-[10px] text-slate-400">{g.direttrice}</span>
              </div>
              <ul className="space-y-2">
                {g.domande.map((d) => {
                  const r = risposta(d.prodottoId, d.domandaId);
                  const chiave = `${d.prodottoId}|${d.domandaId}`;
                  const libera = d.tipo === 'TESTO_LIBERO';
                  const valoreBozza =
                    bozzeTesto[chiave] !== undefined ? bozzeTesto[chiave] : (r?.testo ?? '');
                  return (
                    <li
                      key={d.domandaId}
                      className="border-b border-slate-50 pb-2 last:border-0 last:pb-0"
                    >
                      <p className="text-xs text-slate-700 leading-relaxed">{d.domanda}</p>
                      {libera ? (
                        <div className="mt-1.5 space-y-1">
                          <textarea
                            rows={3}
                            value={valoreBozza}
                            maxLength={d.maxCaratteri ?? 1000}
                            onChange={(e) =>
                              setBozzeTesto((prev) => ({ ...prev, [chiave]: e.target.value }))
                            }
                            onBlur={() => {
                              const testo = valoreBozza.trim();
                              if (testo === (r?.testo ?? '').trim()) return;
                              void salva(d.prodottoId, d.domandaId, null, testo || null);
                            }}
                            placeholder="Risposta sintetica e puntuale"
                            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                            aria-label={`Risposta a ${d.domanda}`}
                          />
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {valoreBozza.length} / {d.maxCaratteri ?? 1000}
                            </span>
                            {inCorso === chiave && (
                              <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              void salva(
                                d.prodottoId,
                                d.domandaId,
                                r?.siNo === true ? null : true,
                                null
                              )
                            }
                            disabled={inCorso === chiave}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50 ${
                              r?.siNo === true
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            Sì
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void salva(
                                d.prodottoId,
                                d.domandaId,
                                r?.siNo === false ? null : false,
                                null
                              )
                            }
                            disabled={inCorso === chiave}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50 ${
                              r?.siNo === false
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            No
                          </button>
                          {inCorso === chiave && (
                            <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {sintesi && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-1">
              <div className="flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Qualificazione dell’operato
                </span>
              </div>
              <p className="text-sm font-bold text-slate-900">{sintesi.etichetta}</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">{sintesi.dettaglio}</p>
              <p className="text-[10px] text-slate-400 tabular-nums">
                {sintesi.risposte} risposte su {sintesi.totale} domande · {sintesi.positive}{' '}
                positive e {sintesi.negative} negative sulle {sintesi.chiuse} domande a risposta
                chiusa.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
