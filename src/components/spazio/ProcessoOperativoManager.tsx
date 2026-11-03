'use client';

// BLOCCO 4 — IL PROCESSO OPERATIVO (0.161.0 → 0.162.0).
//
// IL PROCESSO È UN'OPERATIVITÀ. Dato il prodotto — che porta con sé TS e
// direttrice — si descrive che cosa fa l'ufficio: quali TS servono a farlo, con
// quali attività, in quale ufficio e con quale esito. Non si compila uno schema
// già pronto: si associa ciò che si è identificato e si salva.
//
// LE TS NON SI ESCLUDONO. La stessa TS può comparire in due operatività dello
// stesso prodotto — la TS 81 descrive la diffida, e la diffida può essere un
// passo della sollecitazione e un passo della mora — e una sola operatività può
// metterne insieme più d'una: le M400 guardano il licenziamento, gli sgravi la
// vita lavorativa, e servono entrambe a definire il processo.
//
// La parola «materia» resta nella tabella che i report leggono, non nelle
// schermate di configurazione: due vocabolari per la stessa cosa erano il modo
// in cui chi configurava si perdeva.

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
import {
  operativitaDelProdotto,
  type OperativitaProdotto,
  type ProcessoProdotto,
} from '@/lib/prodotti/processoProdotto';
import type { ProdottoEnte } from '@/lib/prodotti/prodotti';
import type { Tl } from '@/lib/titoliEnte/catalogoTl';
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
  /** La chiave dell'operatività da modificare; null = nuova. */
  chiave: string | null;
  gruppo: string | null;
  tlIds: number[];
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
    const r = await salvaProcessoProdottoAction(nomeSchema, {
      gruppo: bozza.gruppo ?? bozza.chiave,
      prodottoId: bozza.prodottoId,
      tlIds: bozza.tlIds,
      dipendenza: bozza.dipendenza,
      attivita: bozza.attivita,
      esito: bozza.esito,
    });
    if (!r.success) setErrore(r.error || 'Salvataggio non riuscito.');
    else {
      setAvviso('Operatività salvata.');
      setBozza(null);
      await carica();
    }
    setInCorso(false);
  };

  const elimina = async (p: ProdottoEnte, op: OperativitaProdotto) => {
    const ok = await confermaApp(
      `Togliere l’operatività con ${op.codici.join(', ')} dal processo di «${p.nome}»? Le TS restano nel catalogo.`,
      { distruttiva: true, etichettaConferma: 'Togli l’operatività' }
    );
    if (!ok) return;
    setInCorso(true);
    setErrore(null);
    const r = await eliminaProcessoProdottoAction(nomeSchema, p.id, op.chiave);
    if (!r.success) setErrore(r.error || 'Rimozione non riuscita.');
    else await carica();
    setInCorso(false);
  };

  const commutaTs = (tlId: number) => {
    if (!bozza) return;
    setBozza({
      ...bozza,
      tlIds: bozza.tlIds.includes(tlId)
        ? bozza.tlIds.filter((x) => x !== tlId)
        : [...bozza.tlIds, tlId],
    });
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const tsUsateInProdotto = (prodottoId: number) =>
    new Set(operativitaDelProdotto(processi, prodottoId).flatMap((o) => o.tlIds));

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
            , si descrive l’operatività — quali TS la eseguono, con quali attività. Si associa e si
            scrive quello che si è identificato: non c’è uno schema da compilare.
          </p>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Le TS non si escludono: la stessa TS può servire più operatività, e un’operatività può
            metterne insieme più d’una. L’ufficio è il nome della direttrice del prodotto, e si
            sceglie dall’elenco scritto in{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/direttrici-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              Direttrici
            </Link>
            .
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
            const operativita = operativitaDelProdotto(processi, p.id);
            const giaUsate = tsUsateInProdotto(p.id);
            const formAperto = bozza?.prodottoId === p.id;
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    {p.nome}
                  </h3>
                  <span className="text-[10px] text-slate-400">{p.direttrice}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {operativita.length === 0
                      ? 'nessuna operatività'
                      : operativita.length === 1
                        ? '1 operatività'
                        : `${operativita.length} operatività`}
                  </span>
                  {!formAperto && (
                    <button
                      type="button"
                      onClick={() =>
                        setBozza({
                          prodottoId: p.id,
                          chiave: null,
                          gruppo: null,
                          tlIds: [],
                          dipendenza: p.direttrice,
                          attivita: null,
                          esito: null,
                        })
                      }
                      disabled={inCorso || bozza !== null || catalogo.length === 0}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-[10px] font-bold uppercase"
                    >
                      <Plus className="w-3 h-3" /> Aggiungi un’operatività
                    </button>
                  )}
                </div>

                {operativita.length === 0 ? (
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Nessuna operatività: questo prodotto non sa ancora con quali TS e con quali
                    attività l’ufficio lo lavora.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {operativita.map((op, i) => (
                      <li
                        key={op.chiave}
                        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                      >
                        <span className="text-[9px] font-bold text-slate-400 tabular-nums mt-0.5 w-4 shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-slate-800 flex flex-wrap gap-1">
                            {op.codici.map((c, k) => (
                              <span
                                key={`${c}-${k}`}
                                className="font-mono rounded bg-white border border-slate-200 px-1 text-slate-600"
                              >
                                {c}
                              </span>
                            ))}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {op.dipendenza || 'senza ufficio'}
                            {op.esito ? ` · esito: ${op.esito}` : ''}
                          </p>
                          {op.attivita && (
                            <p className="text-[10px] text-slate-600 whitespace-pre-line mt-0.5">
                              {op.attivita}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setBozza({
                              prodottoId: p.id,
                              chiave: op.chiave,
                              gruppo: op.gruppo,
                              tlIds: op.tlIds,
                              dipendenza: op.dipendenza,
                              attivita: op.attivita,
                              esito: op.esito,
                            })
                          }
                          disabled={inCorso || bozza !== null}
                          className="px-2 py-1 rounded-md border border-slate-300 text-[9px] font-bold uppercase text-slate-600 hover:text-sky-700 hover:border-sky-300 disabled:opacity-40 shrink-0"
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => void elimina(p, op)}
                          disabled={inCorso}
                          className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 disabled:opacity-40 shrink-0"
                          aria-label={`Togli l’operatività ${op.codici.join(', ')} da ${p.nome}`}
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
                        {bozza.chiave ? 'Modifica l’operatività' : 'Nuova operatività'}
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

                    <fieldset className="space-y-1">
                      <legend className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        TS che la eseguono ({bozza.tlIds.length} scelte)
                      </legend>
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-1">
                        {catalogo.map((t) => {
                          const scelta = bozza.tlIds.includes(t.id);
                          const altrove = giaUsate.has(t.id) && !scelta;
                          return (
                            <label
                              key={t.id}
                              className={`flex items-start gap-2 text-[11px] leading-snug rounded px-1 py-0.5 ${
                                scelta ? 'bg-sky-50 text-slate-900' : 'text-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={scelta}
                                onChange={() => commutaTs(t.id)}
                                className="mt-0.5"
                              />
                              <span className="min-w-0">
                                <span className="font-mono">{t.codice}</span> · {t.descrizione}
                                {altrove && (
                                  <span className="block text-[9px] text-slate-400">
                                    già in un’altra operatività di questo prodotto
                                  </span>
                                )}
                                {t.prodotto &&
                                  t.prodotto.trim().toLowerCase() !==
                                    p.nome.trim().toLowerCase() && (
                                    <span className="block text-[9px] text-slate-400">
                                      nata sul prodotto: {t.prodotto}
                                    </span>
                                  )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-slate-400 leading-relaxed">
                        Una TS può stare in più operatività: spuntarla qui non la toglie a un’altra.
                      </p>
                    </fieldset>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <label className="md:col-span-5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        Ufficio che la esegue
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
                      <label className="md:col-span-7 text-[9px] font-bold uppercase tracking-wider text-slate-600">
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
                        disabled={
                          inCorso ||
                          bozza.tlIds.length === 0 ||
                          (bozza.attivita ?? '').trim() === ''
                        }
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
          </Link>{' '}
          (il pulsante lo trovi qui sopra, appena c’è una TS da spuntare).
        </p>
      )}
      {catalogo.length === 0 && (
        <p className="text-[10px] text-slate-400 flex items-center gap-1">
          <Link2 className="w-3 h-3" /> Le TS si scrivono una volta sola nel catalogo e si riusano
          qui.
        </p>
      )}
    </div>
  );
}
