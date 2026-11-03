'use client';

// IL CATALOGO DELLE TS — codice, descrizione, prodotto (0.159.0 → 0.162.0).
//
// Una TS si scrive qui, una volta sola. Non sta più dentro il prodotto: la
// stessa lavorazione non va ripetuta per ogni prodotto che la usa, e l'ufficio
// non è una sua proprietà — è il processo con cui l'ufficio la applica a una
// direttrice e a un prodotto (Parametri › Processo operativo), e da lì arriva
// al report per unità operativa.
//
// IL FLAG DELLA CHECK LIST NON STA PIÙ QUI (0.162.0). Il flag e le domande
// sono proprietà del prodotto: la stessa direttrice può avere un prodotto
// presidiato e uno no, e due campi per la stessa domanda erano il modo in cui
// chi configurava finiva per compilarne uno solo. Qui resta l'identità della
// TS: il codice, la descrizione e il prodotto in cui è nata.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  eliminaTlAction,
  ottieniCatalogoTl,
  salvaTlAction,
} from '@/app/actions/materieLavorazione';
import { ottieniProdottiEnte } from '@/app/actions/prodottiEnte';
import type { ProdottoEnte } from '@/lib/prodotti/prodotti';
import {
  chiaveProdottoTl,
  etichettaProdottoTl,
  MASSIMO_CARATTERI_CODICE_TL,
  MASSIMO_CARATTERI_DESCRIZIONE_TL,
  type InputTl,
  type Tl,
} from '@/lib/titoliEnte/catalogoTl';
import { conRitorno } from '@/lib/navigazione/ritorno';

interface Props {
  nomeSchema: string;
  codice: string;
  ritorno?: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const VUOTA: InputTl = {
  id: null,
  codice: '',
  descrizione: '',
  checkList: false,
  versoCheckList: null,
  prodotti: [],
  direttrice: null,
  prodotto: null,
};

export function TlCatalogoManager({ nomeSchema, codice, ritorno }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Catalogo delle TS',
  });

  const [catalogo, setCatalogo] = useState<Tl[]>([]);
  const [prodotti, setProdotti] = useState<ProdottoEnte[]>([]);
  const [bozza, setBozza] = useState<InputTl | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const [r, p] = await Promise.all([
      ottieniCatalogoTl(nomeSchema),
      ottieniProdottiEnte(nomeSchema),
    ]);
    if (r.success) setCatalogo(r.tl);
    else setErrore(r.error || 'Impossibile caricare il catalogo.');
    if (p.success) setProdotti(p.prodotti);
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  /**
   * UN PRODOTTO IN PIÙ O IN MENO (0.166.0). L'associazione è tanti a tanti:
   * spuntare un prodotto non toglie la TS agli altri, e la direttrice arriva
   * dal prodotto — non si riscrive a mano.
   */
  const commutaProdotto = (prodotto: ProdottoEnte) => {
    if (!bozza) return;
    const scelti = bozza.prodotti ?? [];
    const chiave = chiaveProdottoTl(prodotto.direttrice, prodotto.nome);
    const gia = scelti.some((p) => chiaveProdottoTl(p.direttrice, p.prodotto) === chiave);
    setBozza({
      ...bozza,
      prodotti: gia
        ? scelti.filter((p) => chiaveProdottoTl(p.direttrice, p.prodotto) !== chiave)
        : [...scelti, { direttrice: prodotto.direttrice, prodotto: prodotto.nome }],
    });
  };

  const salva = async () => {
    if (!bozza) return;
    setInCorso(true);
    setErrore(null);
    const r = await salvaTlAction(nomeSchema, bozza);
    if (!r.success) setErrore(r.error || 'Salvataggio non riuscito.');
    else {
      setBozza(null);
      await carica();
    }
    setInCorso(false);
  };

  const elimina = async (tl: Tl) => {
    const quante = tl.materie;
    const avviso =
      quante > 0
        ? `Eliminare la TS ${tl.codice} — ${tl.descrizione}? Verranno tolte anche le ${quante} associazioni alle materie.`
        : `Eliminare la TS ${tl.codice} — ${tl.descrizione}?`;
    if (!window.confirm(avviso)) return;
    setInCorso(true);
    setErrore(null);
    const r = await eliminaTlAction(nomeSchema, tl.id);
    if (!r.success) setErrore(r.error || 'Eliminazione non riuscita.');
    else await carica();
    setInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Catalogo delle TS
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Una TS è un <strong>codice</strong>, una <strong>descrizione</strong> e i{' '}
            <strong>prodotti</strong> che la usano: la stessa lavorazione serve più prodotti, quindi
            si scrive una volta sola e si spunta dove serve. Il{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/prodotti`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              flag della check list
            </Link>{' '}
            non sta più qui: è una proprietà del prodotto, con le sue domande. L&apos;ufficio e le
            attività sono il processo operativo; i{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/titoli-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              titoli di credito
            </Link>{' '}
            mettono insieme TS, direttrice e prodotto per costruire la vestizione legale.
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {catalogo.length === 0 ? 'Nessuna TS' : `${catalogo.length} TS`}
          </span>
          <button
            type="button"
            onClick={() => setBozza({ ...VUOTA })}
            disabled={bozza !== null}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase tracking-wider"
          >
            <Plus className="w-3 h-3" /> Nuova TS
          </button>
        </div>

        {catalogo.length === 0 ? (
          <p className="px-3 py-4 text-[11px] text-slate-500 leading-relaxed">
            Il catalogo è vuoto. Scrivi la prima TS: le materie la assoceranno al prodotto e
            all&apos;ufficio, senza riscriverla.
          </p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-wider text-slate-400 text-left">
                <th className="px-3 py-1.5 font-bold">Codice</th>
                <th className="py-1.5 font-bold">Descrizione</th>
                <th className="py-1.5 font-bold text-right">Materie</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {catalogo.map((tl) => (
                <tr key={tl.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-1.5 font-mono font-bold text-slate-800">{tl.codice}</td>
                  <td className="py-1.5 text-slate-700">
                    {tl.descrizione}
                    {tl.prodotti.map((p, i) => (
                      <span
                        key={`${p.direttrice}|${p.prodotto}|${i}`}
                        className="block text-[10px] text-slate-500"
                      >
                        {etichettaProdottoTl(p)}
                      </span>
                    ))}
                  </td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${
                      tl.materie === 0 ? 'text-amber-800 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {tl.materie === 0 ? 'nessuna' : tl.materie}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setBozza({ ...tl, id: tl.id })}
                        disabled={inCorso || bozza !== null}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40"
                        aria-label={`Modifica ${tl.codice}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void elimina(tl)}
                        disabled={inCorso}
                        className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 disabled:opacity-40"
                        aria-label={`Elimina ${tl.codice}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bozza && (
        <div className="space-y-3 border border-sky-200 bg-sky-50/40 rounded-xl p-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <label className="md:col-span-3 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Codice TS
              <input
                type="text"
                value={bozza.codice}
                onChange={(e) => setBozza({ ...bozza, codice: e.target.value })}
                placeholder="Es. 81"
                className={`${CLASSE} mt-0.5`}
                autoFocus
              />
              <span className="text-[9px] text-slate-400">
                {bozza.codice.length} / {MASSIMO_CARATTERI_CODICE_TL}
              </span>
            </label>
            <label className="md:col-span-9 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Descrizione
              <input
                type="text"
                value={bozza.descrizione}
                onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
                placeholder="Es. Diffida M400"
                className={`${CLASSE} mt-0.5`}
              />
              <span className="text-[9px] text-slate-400">
                {bozza.descrizione.length} / {MASSIMO_CARATTERI_DESCRIZIONE_TL}
              </span>
            </label>
          </div>
          {/* BLOCCO 3 (0.161.0 → 0.166.0): la TS è associata ai prodotti e
              alle loro direttrici, e le associazioni sono più d'una. Il
              prodotto si sceglie dall'elenco dei prodotti configurati; la
              direttrice arriva da lì, e non si riscrive. */}
          <fieldset className="space-y-1">
            <legend className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Prodotti a cui appartiene ({(bozza.prodotti ?? []).length} scelti)
            </legend>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 space-y-1">
              {prodotti.length === 0 && (
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Nessun prodotto configurato: la TS resta «storica» finché i prodotti non ci sono.
                </p>
              )}
              {prodotti.map((p) => {
                const chiave = chiaveProdottoTl(p.direttrice, p.nome);
                const scelta = (bozza.prodotti ?? []).some(
                  (x) => chiaveProdottoTl(x.direttrice, x.prodotto) === chiave
                );
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-2 text-[11px] leading-snug rounded px-1 py-0.5 ${
                      scelta ? 'bg-sky-50 text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={scelta}
                      onChange={() => commutaProdotto(p)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      {p.nome}
                      <span className="block text-[9px] text-slate-400">{p.direttrice}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Una TS può appartenere a più prodotti, e un prodotto a più TS: spuntarla qui non la
              toglie agli altri.
            </p>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setBozza(null);
                setErrore(null);
              }}
              disabled={inCorso}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-[10px] font-bold uppercase text-slate-600 hover:bg-white disabled:opacity-40"
            >
              <X className="w-3 h-3" /> Annulla
            </button>
            <button
              type="button"
              onClick={() => void salva()}
              disabled={inCorso || !bozza.codice.trim() || !bozza.descrizione.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Save className="w-3 h-3" /> {inCorso ? 'Salvataggio…' : 'Salva TS'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
