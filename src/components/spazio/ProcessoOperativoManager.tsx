'use client';

// BLOCCO 4 — IL PROCESSO OPERATIVO (0.161.0).
//
// Dato il prodotto, la TS e la direttrice arrivano da sole: qui si scrive solo
// che cosa fa l'ufficio per gestirlo. Il prodotto è la chiave, non la
// «materia»: quel nome resta nella tabella che i report già leggono, ma non
// compare più nelle schermate di configurazione. Due vocabolari per la stessa
// cosa erano il modo in cui chi configurava si perdeva.
//
// LE TS SI SCELGONO DAL PRODOTTO. Il selettore propone solo le TS libere o già
// legate a questo prodotto: una TS legata a un altro prodotto non può essere
// lavorata qui, perché il processo dichiara proprio «quale TS lavora questo
// prodotto».

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Link2, Plus, Save, Trash2, X } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  eliminaProcessoProdottoAction,
  ottieniProcessiProdotto,
  ottieniProdottiEnte,
  salvaProcessoProdottoAction,
} from '@/app/actions/prodottiEnte';
import { ottieniCatalogoTl } from '@/app/actions/materieLavorazione';
import { ottieniDirettriciEnte } from '@/app/actions/screeningAzienda';
import { confermaApp } from '@/components/FinestreApp';
import { conRitorno } from '@/lib/navigazione/ritorno';
import { processiDelProdotto, type ProcessoProdotto } from '@/lib/prodotti/processoProdotto';
import type { ProdottoEnte } from '@/lib/prodotti/prodotti';
import { etichettaTl, type Tl } from '@/lib/titoliEnte/catalogoTl';
import { MASSIMO_CARATTERI_ATTIVITA_RECUPERO } from '@/lib/titoliEnte/recupero';

interface Props {
  nomeSchema: string;
  codice: string;
  ritorno?: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

interface Bozza {
  prodottoId: number;
  tlId: number;
  dipendenza: string | null;
  attivita: string | null;
  esito: string | null;
}

export function ProcessoOperativoManager({ nomeSchema, codice, ritorno }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Processo operativo',
  });

  const [prodotti, setProdotti] = useState<ProdottoEnte[]>([]);
  const [processi, setProcessi] = useState<ProcessoProdotto[]>([]);
  const [catalogo, setCatalogo] = useState<Tl[]>([]);
  const [uffici, setUffici] = useState<string[]>([]);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const [p, pr, c, d] = await Promise.all([
      ottieniProdottiEnte(nomeSchema),
      ottieniProcessiProdotto(nomeSchema),
      ottieniCatalogoTl(nomeSchema),
      ottieniDirettriciEnte(nomeSchema),
    ]);
    if (p.success) setProdotti(p.prodotti);
    else setErrore(p.error || 'Impossibile caricare i prodotti.');
    if (pr.success) setProcessi(pr.processi);
    else setErrore(pr.error || 'Impossibile caricare il processo operativo.');
    if (c.success) setCatalogo(c.tl);
    else setErrore(c.error || 'Impossibile caricare il catalogo delle TS.');
    if (d.success) setUffici(d.direttrici.map((x) => x.nome).filter(Boolean));
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
    const r = await salvaProcessoProdottoAction(nomeSchema, bozza);
    if (!r.success) setErrore(r.error || 'Salvataggio non riuscito.');
    else {
      setAvviso('Processo operativo salvato.');
      setBozza(null);
      await carica();
    }
    setInCorso(false);
  };

  const elimina = async (p: ProdottoEnte, processo: ProcessoProdotto) => {
    const ok = await confermaApp(
      `Togliere la TS ${processo.codice} dal processo di «${p.nome}»? La TS resta nel catalogo delle TS.`,
      { distruttiva: true, etichettaConferma: 'Togli la TS' }
    );
    if (!ok) return;
    setInCorso(true);
    setErrore(null);
    const r = await eliminaProcessoProdottoAction(nomeSchema, p.id, processo.tlId);
    if (!r.success) setErrore(r.error || 'Rimozione non riuscita.');
    else await carica();
    setInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  /** Le TS che si possono applicare a questo prodotto: libere o già sue. */
  const tlDisponibili = (prodottoId: number) => {
    const prodotto = prodotti.find((x) => x.id === prodottoId);
    const gia = new Set(processiDelProdotto(processi, prodottoId).map((x) => x.tlId));
    return catalogo.filter(
      (t) =>
        !gia.has(t.id) &&
        (!t.prodotto ||
          (!!prodotto &&
            String(t.prodotto).trim().toLowerCase() === prodotto.nome.trim().toLowerCase()))
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Processo operativo
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Il quarto blocco: dato il{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/prodotti`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              prodotto
            </Link>
            , che porta con sé la TS e la direttrice, si descrivono le attività di gestione. Una
            riga per TS, nell’ordine in cui l’ufficio le esegue: la prima è quella che il documento
            cita come procedura.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            L’ufficio è il nome della direttrice del prodotto: si scrive una volta in{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/direttrici-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              Direttrici
            </Link>
            , e qui si sceglie dall’elenco.
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {avviso && (
        <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {avviso}
        </p>
      )}

      {prodotti.length === 0 ? (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          Nessun prodotto configurato: senza prodotto non c’è un processo da descrivere. Crealo nel
          blocco{' '}
          <Link
            href={conRitorno(`/spazio/${codice}/parametri/prodotti`, ritorno)}
            className="font-bold underline"
          >
            Prodotti dell’ente
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3">
          {prodotti.map((p) => {
            const suoi = processiDelProdotto(processi, p.id);
            const disponibili = tlDisponibili(p.id);
            const formAperto = bozza?.prodottoId === p.id;
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    {p.nome}
                  </h3>
                  <span className="text-[10px] text-slate-400">{p.direttrice}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {suoi.length === 0
                      ? 'nessuna TS'
                      : suoi.length === 1
                        ? '1 TS'
                        : `${suoi.length} TS`}
                  </span>
                  {!formAperto && disponibili.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setBozza({
                          prodottoId: p.id,
                          tlId: 0,
                          dipendenza: p.direttrice,
                          attivita: null,
                          esito: null,
                        })
                      }
                      disabled={inCorso || bozza !== null}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-[10px] font-bold uppercase"
                    >
                      <Link2 className="w-3 h-3" /> Aggiungi una TS
                    </button>
                  )}
                </div>

                {suoi.length === 0 ? (
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Nessun processo: questo prodotto non sa ancora chi lo lavora né con quali
                    attività.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {suoi.map((x, i) => (
                      <li
                        key={x.id}
                        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                      >
                        <span className="text-[9px] font-bold text-slate-400 tabular-nums mt-0.5 w-4 shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-slate-800">
                            <span className="font-mono text-slate-500">{x.codice}</span> ·{' '}
                            {x.tipologia}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {x.dipendenza || 'senza ufficio'}
                            {x.esito ? ` · esito: ${x.esito}` : ''}
                          </p>
                          {x.attivita && (
                            <p className="text-[10px] text-slate-600 whitespace-pre-line mt-0.5">
                              {x.attivita}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setBozza({
                              prodottoId: p.id,
                              tlId: x.tlId,
                              dipendenza: x.dipendenza,
                              attivita: x.attivita,
                              esito: x.esito,
                            })
                          }
                          disabled={inCorso || bozza !== null}
                          className="px-2 py-1 rounded-md border border-slate-300 text-[9px] font-bold uppercase text-slate-600 hover:text-sky-700 hover:border-sky-300 disabled:opacity-40 shrink-0"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => void elimina(p, x)}
                          disabled={inCorso}
                          className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 disabled:opacity-40 shrink-0"
                          aria-label={`Togli la TS ${x.codice} da ${p.nome}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {formAperto && bozza && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {suoi.some((x) => x.tlId === bozza.tlId)
                          ? 'Modifica il processo'
                          : 'Aggiungi una TS al processo'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setBozza(null)}
                        disabled={inCorso}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 disabled:opacity-40"
                        aria-label="Chiudi"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <label className="md:col-span-5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        TS
                        <select
                          value={bozza.tlId || ''}
                          onChange={(e) => setBozza({ ...bozza, tlId: Number(e.target.value) })}
                          className={`${CLASSE} mt-0.5`}
                          aria-label={`TS del processo di ${p.nome}`}
                        >
                          <option value="">Scegli la TS…</option>
                          {catalogo
                            .filter(
                              (t) => t.id === bozza.tlId || disponibili.some((d) => d.id === t.id)
                            )
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {etichettaTl(t)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="md:col-span-4 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        Ufficio che lo esegue
                        <select
                          value={bozza.dipendenza ?? ''}
                          onChange={(e) =>
                            setBozza({ ...bozza, dipendenza: e.target.value || null })
                          }
                          className={`${CLASSE} mt-0.5`}
                          aria-label="Ufficio del processo"
                        >
                          <option value="">Senza ufficio</option>
                          {uffici.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="md:col-span-3 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        Esito
                        <input
                          type="text"
                          value={bozza.esito ?? ''}
                          onChange={(e) => setBozza({ ...bozza, esito: e.target.value || null })}
                          placeholder="Es. diffida notificata"
                          className={`${CLASSE} mt-0.5`}
                        />
                      </label>
                      <label className="md:col-span-12 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        Attività — una per riga
                        <textarea
                          value={bozza.attivita ?? ''}
                          onChange={(e) => setBozza({ ...bozza, attivita: e.target.value || null })}
                          rows={4}
                          placeholder={
                            '1. Verificare il flusso sul cassetto bidirezionale\n2. Acquisire la proposta di regolarizzazione'
                          }
                          className={`${CLASSE} mt-0.5 leading-relaxed`}
                          aria-label="Attività del processo"
                        />
                        <span className="text-[9px] text-slate-400">
                          {(bozza.attivita ?? '').length} / {MASSIMO_CARATTERI_ATTIVITA_RECUPERO}
                        </span>
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void salva()}
                        disabled={inCorso || !bozza.tlId}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase hover:bg-slate-800 disabled:bg-slate-300"
                      >
                        <Save className="w-3 h-3" /> {inCorso ? 'Salvataggio…' : 'Salva'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {prodotti.length > 0 && catalogo.length === 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          Il catalogo delle TS è vuoto: una TS è il codice con cui il processo viene citato.
          Scrivile nel blocco{' '}
          <Link
            href={conRitorno(`/spazio/${codice}/parametri/tl`, ritorno)}
            className="font-bold underline"
          >
            Catalogo delle TS
          </Link>
          .
        </p>
      )}
    </div>
  );
}
