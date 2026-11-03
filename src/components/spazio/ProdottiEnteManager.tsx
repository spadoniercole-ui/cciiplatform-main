'use client';

// BLOCCO 2 — I PRODOTTI DELL'ENTE (0.161.0).
//
// Il fatto concreto su cui si lavora («DURC», «Diffide») dentro una direttrice.
// Qui si decide anche se quel prodotto entra nella check list del triage: con
// il flag acceso compaiono le domande, e domanda per domanda si sceglie se la
// risposta è chiusa (Sì/No) o libera, con il tetto dei mille caratteri.
//
// IL FLAG SENZA DOMANDE NON SI SALVA. Un prodotto «in check list» senza
// domande manderebbe il triage in stand-by per un questionario vuoto: il
// silenzio sembrerebbe una verifica fatta. Il blocco lo impedisce qui, e la
// server action lo rifiuta comunque.
//
// I prodotti nascevano dentro le direttrici, come semplici stringhe in un
// elenco: non c'era un posto dove dire «questo va in check list», né quali
// domande fare. Il flag e le domande sono proprietà del prodotto, non della
// direttrice — la stessa area può avere un prodotto presidiato e uno no.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Package, Plus, Save, Trash2, X } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  eliminaProdottoEnteAction,
  ottieniProdottiEnte,
  salvaProdottoEnteAction,
} from '@/app/actions/prodottiEnte';
import { ottieniDirettriciEnte } from '@/app/actions/screeningAzienda';
import { confermaApp } from '@/components/FinestreApp';
import { conRitorno } from '@/lib/navigazione/ritorno';
import {
  ETICHETTA_TIPO_DOMANDA,
  MASSIMO_CARATTERI_DOMANDA,
  MASSIMO_CARATTERI_NOME_PRODOTTO,
  MASSIMO_CARATTERI_RISPOSTA_LIBERA,
  prodottiDellaDirettrice,
  type DomandaProdotto,
  type InputProdottoEnte,
  type ProdottoEnte,
  type TipoDomanda,
} from '@/lib/prodotti/prodotti';

interface Props {
  nomeSchema: string;
  codice: string;
  ritorno?: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const VUOTO = (direttrice: string): InputProdottoEnte => ({
  id: null,
  direttrice,
  nome: '',
  inChecklist: false,
  domande: [],
});

/** Una domanda nuova nasce chiusa: è la forma più frequente nella pratica. */
const domandaVuota = (n: number): DomandaProdotto => ({
  id: `q${n}`,
  testo: '',
  tipo: 'SI_NO',
  maxCaratteri: null,
});

export function ProdottiEnteManager({ nomeSchema, codice, ritorno }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Prodotti dell’ente',
  });

  const [prodotti, setProdotti] = useState<ProdottoEnte[]>([]);
  const [direttrici, setDirettrici] = useState<string[]>([]);
  const [bozza, setBozza] = useState<InputProdottoEnte | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const [p, d] = await Promise.all([
      ottieniProdottiEnte(nomeSchema),
      ottieniDirettriciEnte(nomeSchema),
    ]);
    if (p.success) setProdotti(p.prodotti);
    else setErrore(p.error || 'Impossibile caricare i prodotti.');
    if (d.success) setDirettrici(d.direttrici.map((x) => x.nome).filter(Boolean));
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const salva = async () => {
    if (!bozza) return;
    setInCorso(true);
    setErrore(null);
    setAvviso(null);
    const r = await salvaProdottoEnteAction(nomeSchema, bozza);
    if (!r.success) setErrore(r.error || 'Salvataggio non riuscito.');
    else {
      setAvviso(`Prodotto «${bozza.nome.trim()}» salvato.`);
      setBozza(null);
      await carica();
    }
    setInCorso(false);
  };

  const elimina = async (p: ProdottoEnte) => {
    const ok = await confermaApp(
      `Eliminare il prodotto «${p.nome}» (${p.direttrice})? Si tolgono anche il suo processo operativo e le risposte di check list già date. La TS resta nel catalogo.`,
      { distruttiva: true, etichettaConferma: 'Elimina il prodotto' }
    );
    if (!ok) return;
    setInCorso(true);
    setErrore(null);
    const r = await eliminaProdottoEnteAction(nomeSchema, p.id);
    if (!r.success) setErrore(r.error || 'Eliminazione non riuscita.');
    else await carica();
    setInCorso(false);
  };

  const impostaDomanda = (indice: number, patch: Partial<DomandaProdotto>) => {
    if (!bozza) return;
    const domande = bozza.domande.map((d, i) => (i === indice ? { ...d, ...patch } : d));
    setBozza({ ...bozza, domande });
  };

  const cambiaTipo = (indice: number, tipo: TipoDomanda) => {
    impostaDomanda(indice, {
      tipo,
      maxCaratteri:
        tipo === 'TESTO_LIBERO'
          ? (bozza?.domande[indice].maxCaratteri ?? MASSIMO_CARATTERI_RISPOSTA_LIBERA)
          : null,
    });
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const direttriciConProdotti = direttrici.filter(
    (d) => prodottiDellaDirettrice(prodotti, d).length > 0
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <Package className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Prodotti dell’ente
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Il secondo blocco della catena: ogni prodotto sta dentro una{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/direttrici-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              direttrice
            </Link>
            . Il flag «in check list» decide se il triage dovrà chiedere qualcosa su questo
            prodotto; con il flag acceso si scrivono le domande, e per ciascuna se la risposta è
            chiusa (Sì/No) o libera, entro {MASSIMO_CARATTERI_RISPOSTA_LIBERA} caratteri.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Le domande non sono un questionario generico: sono quelle che l’operatore si troverà
            davanti nel triage, dopo aver caricato visura e prospetti, quando il sistema va in
            stand-by per la check list.
          </p>
        </div>
      </div>

      {errore && (
        <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{errore}</span>
        </div>
      )}
      {avviso && (
        <p className="flex items-start gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{avviso}</span>
        </p>
      )}

      {direttrici.length === 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          Prima delle direttrici non si può creare un prodotto: ogni prodotto appartiene a un’area.
          Aprila{' '}
          <Link
            href={conRitorno(`/spazio/${codice}/parametri/direttrici-ente`, ritorno)}
            className="font-bold underline"
          >
            Direttrici dell’ente
          </Link>
          .
        </p>
      )}

      {direttriciConProdotti.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nessun prodotto configurato: senza, il triage non ha domande da porre e i processi non
          hanno un soggetto.
        </p>
      ) : (
        <div className="space-y-4">
          {direttriciConProdotti.map((direttrice) => (
            <div key={direttrice} className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {direttrice}
              </h3>
              <ul className="space-y-1.5">
                {prodottiDellaDirettrice(prodotti, direttrice).map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-start gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900">{p.nome}</p>
                      <p className="text-[10px] text-slate-500">
                        {p.inChecklist
                          ? `in check list · ${p.domande.length} ${
                              p.domande.length === 1 ? 'domanda' : 'domande'
                            }`
                          : 'fuori dalla check list'}
                      </p>
                      {p.inChecklist && p.domande.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {p.domande.map((d) => (
                            <li key={d.id} className="text-[10px] text-slate-600">
                              — {d.testo}{' '}
                              <span className="text-slate-400">
                                ({d.tipo === 'SI_NO' ? 'Sì/No' : `testo, max ${d.maxCaratteri}`})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setBozza({
                            id: p.id,
                            direttrice: p.direttrice,
                            nome: p.nome,
                            inChecklist: p.inChecklist,
                            domande: p.domande,
                          })
                        }
                        disabled={inCorso || bozza !== null}
                        className="px-2 py-1 rounded-md border border-slate-300 text-[9px] font-bold uppercase text-slate-600 hover:text-sky-700 hover:border-sky-300 disabled:opacity-40"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => void elimina(p)}
                        disabled={inCorso}
                        className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 disabled:opacity-40"
                        aria-label={`Elimina ${p.nome}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {direttrici.length > 0 && bozza === null && (
        <button
          type="button"
          onClick={() => setBozza(VUOTO(direttrici[0]))}
          className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-500 hover:text-blue-700 font-bold text-xs uppercase rounded-lg transition-colors w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" /> Nuovo prodotto
        </button>
      )}

      {bozza && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {bozza.id ? 'Modifica il prodotto' : 'Nuovo prodotto'}
            </p>
            <button
              type="button"
              onClick={() => {
                setBozza(null);
                setErrore(null);
              }}
              disabled={inCorso}
              className="p-1 rounded text-slate-500 hover:text-slate-900 disabled:opacity-40"
              aria-label="Chiudi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <label className="md:col-span-4 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Direttrice
              <select
                value={bozza.direttrice}
                onChange={(e) => setBozza({ ...bozza, direttrice: e.target.value })}
                className={`${CLASSE} mt-0.5`}
                aria-label="Direttrice del prodotto"
              >
                {direttrici.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Prodotto
              <input
                type="text"
                value={bozza.nome}
                onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
                placeholder="Es. DURC, Diffide, Cassa Integrazione"
                className={`${CLASSE} mt-0.5`}
                aria-label="Nome del prodotto"
              />
              <span className="text-[9px] text-slate-400">
                {bozza.nome.length} / {MASSIMO_CARATTERI_NOME_PRODOTTO}
              </span>
            </label>
            <label className="md:col-span-3 flex items-end gap-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
              <input
                type="checkbox"
                checked={bozza.inChecklist}
                onChange={(e) =>
                  setBozza({
                    ...bozza,
                    inChecklist: e.target.checked,
                    domande:
                      e.target.checked && bozza.domande.length === 0
                        ? [domandaVuota(1)]
                        : bozza.domande,
                  })
                }
                className="w-3.5 h-3.5 accent-sky-600"
              />
              In check list
            </label>
          </div>

          {bozza.inChecklist && (
            <div className="space-y-2 border-t border-sky-200 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                Domande della check
              </p>
              {bozza.domande.length === 0 && (
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Con il flag acceso serve almeno una domanda: il triage va in stand-by per chiedere
                  qualcosa, e un elenco vuoto lo lascerebbe in attesa di nulla.
                </p>
              )}
              {bozza.domande.map((d, i) => (
                <div
                  key={d.id}
                  className="rounded-lg border border-slate-200 bg-white p-2 space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[9px] font-bold text-slate-400 tabular-nums mt-1.5 w-4 shrink-0">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      value={d.testo}
                      onChange={(e) => impostaDomanda(i, { testo: e.target.value })}
                      placeholder="Es. Il versamento risulta regolare alla data della verifica?"
                      className={CLASSE}
                      aria-label={`Domanda ${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setBozza({ ...bozza, domande: bozza.domande.filter((_, k) => k !== i) })
                      }
                      className="p-1 rounded text-slate-400 hover:text-red-700 shrink-0"
                      aria-label={`Togli la domanda ${i + 1}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-2 pl-6">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
                      Risposta
                      <select
                        value={d.tipo}
                        onChange={(e) => cambiaTipo(i, e.target.value as TipoDomanda)}
                        className={`${CLASSE} mt-0.5`}
                        aria-label={`Tipo di risposta ${i + 1}`}
                      >
                        <option value="SI_NO">{ETICHETTA_TIPO_DOMANDA.SI_NO}</option>
                        <option value="TESTO_LIBERO">{ETICHETTA_TIPO_DOMANDA.TESTO_LIBERO}</option>
                      </select>
                    </label>
                    {d.tipo === 'TESTO_LIBERO' && (
                      <label className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        Max caratteri
                        <input
                          type="number"
                          min={1}
                          max={MASSIMO_CARATTERI_RISPOSTA_LIBERA}
                          value={d.maxCaratteri ?? MASSIMO_CARATTERI_RISPOSTA_LIBERA}
                          onChange={(e) =>
                            impostaDomanda(i, {
                              maxCaratteri:
                                Number(e.target.value) || MASSIMO_CARATTERI_RISPOSTA_LIBERA,
                            })
                          }
                          className={`${CLASSE} mt-0.5 max-w-[8rem]`}
                        />
                      </label>
                    )}
                    <span className="text-[9px] text-slate-400">
                      {d.testo.length} / {MASSIMO_CARATTERI_DOMANDA}
                    </span>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setBozza({
                    ...bozza,
                    domande: [...bozza.domande, domandaVuota(bozza.domande.length + 1)],
                  })
                }
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
              >
                <Plus className="w-3 h-3" /> Aggiungi domanda
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void salva()}
              disabled={inCorso || !bozza.nome.trim() || !bozza.direttrice.trim()}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Save className="w-3 h-3" /> {inCorso ? 'Salvataggio…' : 'Salva prodotto'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
