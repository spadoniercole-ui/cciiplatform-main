'use client';

// MATERIE E TL — passo 2 del flusso (0.157.0).
//
// Qui non si scrivono più le TL: si dice quali TL del catalogo ogni materia
// eredita. Le TL si scrivono al passo 1, dentro i prodotti delle direttrici,
// dove il lavoro si organizza; la materia è l'associazione fra i codici di
// partita che l'ente ha in anagrafica e le lavorazioni che li trattano.
//
// PERCHÉ COSÌ. Prima la TL nasceva qui, e il prodotto era solo un nome nel
// questionario: per lavorare un DURC bisognava aspettare che una materia
// esistesse, inventare lì la lavorazione e poi associarla ai titoli — girando
// il flusso al contrario (prodotti vuoti, TL nella materia, associazione alla
// fine). La stessa TL serve spesso più materie: scritta una volta, si associa.
//
// L'ORDINE CONTA. Le TL di una materia si eseguono in sequenza: la prima è
// quella che il titolo del codice eredita e che il report dell'ufficio usa come
// procedura. L'associazione nuova va in fondo.

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Link2, Unlink } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import {
  collegaTlMateriaAction,
  ottieniCatalogoTl,
  ottieniLavorazioniMateria,
  scollegaTlMateriaAction,
} from '@/app/actions/materieLavorazione';
import { conRitorno } from '@/lib/navigazione/ritorno';
import {
  lavorazioniDellaMateria,
  type LavorazioneMateria,
} from '@/lib/titoliEnte/lavorazioniMateria';
import type { MateriaEnte } from '@/lib/titoliEnte/materie';
import type { TlProdotto } from '@/lib/titoliEnte/prodottiTl';

interface Props {
  nomeSchema: string;
  codice: string;
  /** La materia da cui si arriva (dal triage, `?materia=`): si apre in evidenza. */
  apriMateriaId?: number | null;
  /** La pagina da cui si è arrivati: si riporta nei rimandi fra le gestioni. */
  ritorno?: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

export function MaterieLavorazioneManager({
  nomeSchema,
  codice,
  apriMateriaId = null,
  ritorno,
}: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Materie e TL',
  });

  const [materie, setMaterie] = useState<MateriaEnte[]>([]);
  const [lavorazioni, setLavorazioni] = useState<LavorazioneMateria[]>([]);
  const [catalogo, setCatalogo] = useState<TlProdotto[]>([]);
  const [scelta, setScelta] = useState<Record<number, number | ''>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const blocchiMateria = useRef(new Map<number, HTMLDivElement>());

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const [m, l, c] = await Promise.all([
      ottieniMaterieEnteAction(nomeSchema),
      ottieniLavorazioniMateria(nomeSchema),
      ottieniCatalogoTl(nomeSchema),
    ]);
    if (m.success) setMaterie(m.materie);
    else setErrore(m.error || 'Impossibile caricare le materie.');
    if (l.success) setLavorazioni(l.lavorazioni);
    else setErrore(l.error || 'Impossibile caricare le lavorazioni delle materie.');
    if (!c.success) setErrore(c.error || 'Impossibile caricare il catalogo delle TL.');
    else setCatalogo(c.tl);
    setCaricamento(false);
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  // La materia da cui si arriva si porta sotto il cursore: un elenco lungo, con
  // trenta materie, non dice a nessuno quale delle trenta sia quella segnalata.
  useEffect(() => {
    if (!apriMateriaId || caricamento) return;
    const blocco = blocchiMateria.current.get(apriMateriaId);
    if (blocco) blocco.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [apriMateriaId, caricamento]);

  const collega = async (materiaId: number) => {
    const tlId = scelta[materiaId];
    if (!tlId) return;
    setInCorso(true);
    setErrore(null);
    const r = await collegaTlMateriaAction(nomeSchema, materiaId, tlId);
    if (!r.success) setErrore(r.error || 'Associazione non riuscita.');
    else {
      setScelta((prev) => ({ ...prev, [materiaId]: '' }));
      await carica();
    }
    setInCorso(false);
  };

  const scollega = async (tl: LavorazioneMateria) => {
    setInCorso(true);
    setErrore(null);
    const r = await scollegaTlMateriaAction(nomeSchema, tl.materiaId, tl.id);
    if (!r.success) setErrore(r.error || 'Rimozione non riuscita.');
    else await carica();
    setInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const materieConId = materie.filter((m): m is MateriaEnte & { id: number } => m.id != null);
  const materieSenzaTl = materieConId.filter(
    (m) => lavorazioniDellaMateria(lavorazioni, m.id).length === 0
  );
  /** Le TL non ancora associate a questa materia: quelle già associate non si ripropongono. */
  const tlDisponibili = (materiaId: number) => {
    const gia = new Set(lavorazioniDellaMateria(lavorazioni, materiaId).map((l) => l.id));
    return catalogo.filter((t) => !gia.has(t.id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Materie e TL
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Una materia raccoglie codici di partita che si lavorano allo stesso modo: qui si dice
            <strong> quali TL del catalogo eredita</strong>. Le TL — ufficio, passi, esito e
            contrassegno di perimetro — si scrivono dentro i{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/direttrici-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline inline-flex items-center gap-0.5"
            >
              prodotti delle direttrici <ArrowRight className="w-3 h-3" />
            </Link>
            , una volta sola; i{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/titoli-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline inline-flex items-center gap-0.5"
            >
              titoli di credito <ArrowRight className="w-3 h-3" />
            </Link>{' '}
            le ereditano dalla materia, e solo un ufficio scritto sul singolo codice ha la
            precedenza.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            L’ordine è quello in cui l’ufficio le esegue: la prima è quella che il titolo eredita.
          </p>
        </div>
      </div>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      {catalogo.length === 0 && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
          Il catalogo delle TL è ancora vuoto: finché non ne scrivi una nei prodotti, nessuna
          materia ha qualcosa da ereditare. Le TL già configurate prima di questa versione sono
          state copiate nel catalogo, sotto il prodotto che porta il loro nome: rinomina il prodotto
          dove serve.
        </p>
      )}

      {materie.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nessuna materia configurata. Le materie si creano nei{' '}
          <Link
            href={conRitorno(`/spazio/${codice}/parametri/titoli-ente`, ritorno)}
            className="font-bold text-sky-700 hover:underline"
          >
            titoli di credito dell’ente
          </Link>
          : una TL senza materia non avrebbe codici da lavorare.
        </p>
      ) : (
        <div className="space-y-3">
          {materieConId.map((m) => {
            const associate = lavorazioniDellaMateria(lavorazioni, m.id);
            const disponibili = tlDisponibili(m.id);
            return (
              <div
                key={m.id}
                id={`materia-${m.id}`}
                ref={(el) => {
                  if (el) blocchiMateria.current.set(m.id, el);
                  else blocchiMateria.current.delete(m.id);
                }}
                className={`rounded-xl border border-slate-200 bg-white p-4 space-y-3 ${
                  apriMateriaId === m.id ? 'ring-2 ring-amber-300 ring-offset-2' : ''
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    {m.nome}
                  </h3>
                  {m.stato !== 'CONFERMATA' && (
                    <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 rounded px-1.5 py-0.5">
                      materia non confermata
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {associate.length === 0
                      ? 'nessuna TL'
                      : associate.length === 1
                        ? '1 TL'
                        : `${associate.length} TL`}
                  </span>
                </div>

                {associate.length === 0 ? (
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Nessuna TL associata: i codici di questa materia restano senza ufficio e senza
                    procedura.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {associate.map((l, indice) => {
                      const voce = catalogo.find((t) => t.id === l.id);
                      return (
                        <li
                          key={l.id}
                          className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                        >
                          <span className="text-[9px] font-bold text-slate-400 tabular-nums mt-0.5 w-4 shrink-0">
                            {indice + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-slate-800">
                              {l.tipologia}
                              {l.rilevantePerimetro && (
                                <span
                                  className={`ml-1.5 text-[9px] font-bold uppercase rounded px-1 py-0.5 ${
                                    l.versoPerimetro === 'RESISTENZA'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  perimetro
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {voce ? `${voce.prodotto} · ${voce.direttrice}` : 'TL del catalogo'}
                              {l.dipendenza ? ` · ${l.dipendenza}` : ' · senza ufficio'}
                              {l.esito ? ` · esito: ${l.esito}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void scollega(l)}
                            disabled={inCorso}
                            title="Togli questa TL dalla materia: la TL resta nel catalogo"
                            className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 text-[9px] font-bold uppercase text-slate-600 hover:text-red-700 hover:border-red-300 disabled:opacity-40 shrink-0"
                          >
                            <Unlink className="w-3 h-3" /> Togli
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {disponibili.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      aria-label={`TL da associare a ${m.nome}`}
                      value={scelta[m.id] ?? ''}
                      onChange={(e) =>
                        setScelta((prev) => ({
                          ...prev,
                          [m.id]: e.target.value ? Number(e.target.value) : '',
                        }))
                      }
                      className={`${CLASSE} max-w-md`}
                    >
                      <option value="">Scegli una TL del catalogo…</option>
                      {disponibili.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.direttrice} · {t.prodotto} · {t.tipologia}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void collega(m.id)}
                      disabled={inCorso || !scelta[m.id]}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sky-600 text-white text-[10px] font-bold uppercase hover:bg-sky-700 disabled:bg-slate-300"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Associa
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {materieSenzaTl.length > 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Senza TL: {materieSenzaTl.map((m) => m.nome).join(', ')}. I codici di queste materie
          restano fuori dal report per unità operativa finché non associano una lavorazione.
        </p>
      )}
    </div>
  );
}
