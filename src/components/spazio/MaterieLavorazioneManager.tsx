'use client';

// MATERIE E TS — il passo in cui la materia mutua direttrice e prodotto (0.159.0).
//
// La TS è un codice con una descrizione e un flag per la check list: sta nel
// suo catalogo (Parametri › Catalogo delle TS) e non si riscrive qui. Qui la
// materia dice su quale direttrice e su quale prodotto la applica, con quale
// ufficio, quali passi e quale esito: è il processo che finisce nel report per
// unità operativa e nelle comunicazioni ai reparti.
//
// L'ORDINE CONTA. Le TS di una materia si eseguono in sequenza: la prima è
// quella che il titolo del codice eredita e che il report dell'ufficio usa come
// procedura.
//
// La stessa TS può essere applicata da più materie, anche su prodotti diversi:
// la TS resta una, cambia il processo.

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardList, Link2, Pencil, Unlink, X } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import { ottieniDirettriciEnte } from '@/app/actions/screeningAzienda';
import type { DirettriceStrutturata } from '@/app/actions/screeningAzienda';
import {
  ottieniCatalogoTl,
  ottieniLavorazioniMateria,
  salvaAssociazioneTlAction,
  scollegaTlMateriaAction,
} from '@/app/actions/materieLavorazione';
import { conRitorno } from '@/lib/navigazione/ritorno';
import {
  lavorazioniDellaMateria,
  type InputAssociazioneTl,
  type LavorazioneMateria,
} from '@/lib/titoliEnte/lavorazioniMateria';
import { etichettaTl, type Tl } from '@/lib/titoliEnte/catalogoTl';
import { nomiDirettrici } from '@/lib/titoliEnte/direttrici';
import { MASSIMO_CARATTERI_ATTIVITA_RECUPERO } from '@/lib/titoliEnte/recupero';
import type { MateriaEnte } from '@/lib/titoliEnte/materie';

interface Props {
  nomeSchema: string;
  codice: string;
  /** La materia da cui si arriva (dal triage, `?materia=`): si apre in evidenza. */
  apriMateriaId?: number | null;
  /** La pagina da cui si è arrivati: si riporta nei rimandi fra le gestioni. */
  ritorno?: string;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const vuota = (materiaId: number): InputAssociazioneTl => ({
  materiaId,
  tlId: 0,
  direttrice: '',
  prodotto: '',
  dipendenza: null,
  procedura: null,
  esito: null,
});

export function MaterieLavorazioneManager({
  nomeSchema,
  codice,
  apriMateriaId = null,
  ritorno,
}: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Materie e TS',
  });

  const [materie, setMaterie] = useState<MateriaEnte[]>([]);
  const [lavorazioni, setLavorazioni] = useState<LavorazioneMateria[]>([]);
  const [catalogo, setCatalogo] = useState<Tl[]>([]);
  const [direttrici, setDirettrici] = useState<DirettriceStrutturata[]>([]);
  const [bozza, setBozza] = useState<InputAssociazioneTl | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const blocchiMateria = useRef(new Map<number, HTMLDivElement>());

  const carica = async () => {
    setCaricamento(true);
    setErrore(null);
    const [m, l, c, d] = await Promise.all([
      ottieniMaterieEnteAction(nomeSchema),
      ottieniLavorazioniMateria(nomeSchema),
      ottieniCatalogoTl(nomeSchema),
      ottieniDirettriciEnte(nomeSchema),
    ]);
    if (m.success) setMaterie(m.materie);
    else setErrore(m.error || 'Impossibile caricare le materie.');
    if (l.success) setLavorazioni(l.lavorazioni);
    else setErrore(l.error || 'Impossibile caricare le lavorazioni delle materie.');
    if (!c.success) setErrore(c.error || 'Impossibile caricare il catalogo delle TS.');
    else setCatalogo(c.tl);
    if (d.success) setDirettrici(d.direttrici);
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

  const salva = async () => {
    if (!bozza) return;
    setInCorso(true);
    setErrore(null);
    const r = await salvaAssociazioneTlAction(nomeSchema, bozza);
    if (!r.success) setErrore(r.error || 'Associazione non riuscita.');
    else {
      setBozza(null);
      await carica();
    }
    setInCorso(false);
  };

  const scollega = async (tl: LavorazioneMateria) => {
    if (!window.confirm(`Togliere la TS ${tl.codice} da questa materia? La TS resta nel catalogo.`))
      return;
    setInCorso(true);
    setErrore(null);
    const r = await scollegaTlMateriaAction(nomeSchema, tl.materiaId, tl.id);
    if (!r.success) setErrore(r.error || 'Rimozione non riuscita.');
    else await carica();
    setInCorso(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const uffici = nomiDirettrici(direttrici);
  const materieConId = materie.filter((m): m is MateriaEnte & { id: number } => m.id != null);
  const materieSenzaTl = materieConId.filter(
    (m) => lavorazioniDellaMateria(lavorazioni, m.id).length === 0
  );
  /** Le TS non ancora applicate da questa materia. */
  const tlDisponibili = (materiaId: number) => {
    const gia = new Set(lavorazioniDellaMateria(lavorazioni, materiaId).map((l) => l.id));
    return catalogo.filter((t) => !gia.has(t.id));
  };
  const prodottiDirettrice = (nome: string) =>
    direttrici.find((d) => d.nome.trim().toLowerCase() === nome.trim().toLowerCase())?.prodotti ??
    [];
  const apreBozza = (m: MateriaEnte & { id: number }) => setBozza(vuota(m.id));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Materie e TS
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
            Una materia raccoglie codici di partita che si lavorano allo stesso modo. Qui dice{' '}
            <strong>quale TS applica</strong>, su <strong>quale direttrice e prodotto</strong>, con
            quale ufficio, quali passi e quale esito: è il processo che finisce nel report per unità
            operativa. Le TS si scrivono una volta sola nel{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/tl`, ritorno)}
              className="font-bold text-sky-700 hover:underline inline-flex items-center gap-0.5"
            >
              catalogo <ArrowRight className="w-3 h-3" />
            </Link>
            ; le direttrici e i loro prodotti in{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/direttrici-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              Direttrici e prodotti
            </Link>
            . I{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/titoli-ente`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              titoli di credito
            </Link>{' '}
            mettono insieme TS, direttrice e prodotto e costruiscono la vestizione legale.
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
          Il catalogo delle TS è ancora vuoto: finché non ne scrivi una, nessuna materia ha qualcosa
          da applicare. Le TS già configurate sono state copiate nel catalogo, con la descrizione
          che avevano.
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
          : una TS senza materia non avrebbe codici da lavorare.
        </p>
      ) : (
        <div className="space-y-3">
          {materieConId.map((m) => {
            const associate = lavorazioniDellaMateria(lavorazioni, m.id);
            const disponibili = tlDisponibili(m.id);
            const formAperto = bozza?.materiaId === m.id;
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
                      ? 'nessuna TS'
                      : associate.length === 1
                        ? '1 TS'
                        : `${associate.length} TS`}
                  </span>
                  {!formAperto && disponibili.length > 0 && (
                    <button
                      type="button"
                      onClick={() => apreBozza(m)}
                      disabled={inCorso}
                      className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-[10px] font-bold uppercase"
                    >
                      <Link2 className="w-3 h-3" /> Applica una TS
                    </button>
                  )}
                </div>

                {associate.length === 0 ? (
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Nessuna TS applicata: i codici di questa materia restano senza ufficio e senza
                    procedura.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {associate.map((l, indice) => (
                      <li
                        key={l.id}
                        className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                      >
                        <span className="text-[9px] font-bold text-slate-400 tabular-nums mt-0.5 w-4 shrink-0">
                          {indice + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-slate-800">
                            <span className="font-mono text-slate-500">{l.codice}</span> ·{' '}
                            {l.tipologia}
                            {l.rilevantePerimetro && (
                              <span
                                className={`ml-1.5 text-[9px] font-bold uppercase rounded px-1 py-0.5 ${
                                  l.versoPerimetro === 'RESISTENZA'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                check list
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {l.prodotto || 'prodotto non indicato'} ·{' '}
                            {l.direttrice || 'direttrice non indicata'}
                            {l.dipendenza ? ` · ${l.dipendenza}` : ' · senza ufficio'}
                            {l.esito ? ` · esito: ${l.esito}` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setBozza({
                              materiaId: m.id,
                              tlId: l.id,
                              direttrice: l.direttrice,
                              prodotto: l.prodotto,
                              dipendenza: l.dipendenza,
                              procedura: l.procedura,
                              esito: l.esito,
                            });
                          }}
                          disabled={inCorso || bozza !== null}
                          title="Modifica il processo di questa TS"
                          className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 text-[9px] font-bold uppercase text-slate-600 hover:text-sky-700 hover:border-sky-300 disabled:opacity-40 shrink-0"
                        >
                          <Pencil className="w-3 h-3" /> Modifica
                        </button>
                        <button
                          type="button"
                          onClick={() => void scollega(l)}
                          disabled={inCorso}
                          title="Togli questa TS dalla materia: la TS resta nel catalogo"
                          className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 text-[9px] font-bold uppercase text-slate-600 hover:text-red-700 hover:border-red-300 disabled:opacity-40 shrink-0"
                        >
                          <Unlink className="w-3 h-3" /> Togli
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {formAperto && bozza && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {associate.some((l) => l.id === bozza.tlId)
                          ? 'Modifica il processo'
                          : 'Applica una TS alla materia'}
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
                          aria-label={`TS da applicare a ${m.nome}`}
                        >
                          <option value="">Scegli la TS del catalogo…</option>
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
                        Direttrice
                        <select
                          value={bozza.direttrice}
                          onChange={(e) =>
                            setBozza({ ...bozza, direttrice: e.target.value, prodotto: '' })
                          }
                          className={`${CLASSE} mt-0.5`}
                          aria-label="Direttrice"
                        >
                          <option value="">Scegli la direttrice…</option>
                          {uffici.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                          {bozza.direttrice &&
                            !uffici.some(
                              (u) =>
                                u.trim().toLowerCase() === bozza.direttrice.trim().toLowerCase()
                            ) && <option value={bozza.direttrice}>{bozza.direttrice}</option>}
                        </select>
                      </label>
                      <label className="md:col-span-3 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        Prodotto
                        <input
                          type="text"
                          list={`prodotti-${m.id}`}
                          value={bozza.prodotto}
                          onChange={(e) => setBozza({ ...bozza, prodotto: e.target.value })}
                          placeholder="Es. DURC"
                          className={`${CLASSE} mt-0.5`}
                          aria-label="Prodotto"
                        />
                        <datalist id={`prodotti-${m.id}`}>
                          {prodottiDirettrice(bozza.direttrice).map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </label>
                      <label className="md:col-span-5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
                        Ufficio che la esegue
                        <select
                          value={bozza.dipendenza ?? ''}
                          onChange={(e) =>
                            setBozza({ ...bozza, dipendenza: e.target.value || null })
                          }
                          className={`${CLASSE} mt-0.5`}
                          aria-label="Ufficio che la esegue"
                        >
                          <option value="">Senza ufficio</option>
                          {uffici.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                          {bozza.dipendenza &&
                            !uffici.some(
                              (u) =>
                                u.trim().toLowerCase() === bozza.dipendenza!.trim().toLowerCase()
                            ) && <option value={bozza.dipendenza}>{bozza.dipendenza}</option>}
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
                        Passi — uno per riga
                        <textarea
                          value={bozza.procedura ?? ''}
                          onChange={(e) =>
                            setBozza({ ...bozza, procedura: e.target.value || null })
                          }
                          rows={4}
                          placeholder={
                            '1. Verificare il messaggio sul cassetto bidirezionale\n2. Acquisire la proposta'
                          }
                          className={`${CLASSE} mt-0.5 leading-relaxed`}
                        />
                        <span className="text-[9px] text-slate-400">
                          {(bozza.procedura ?? '').length} / {MASSIMO_CARATTERI_ATTIVITA_RECUPERO}
                        </span>
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void salva()}
                        disabled={
                          inCorso ||
                          !bozza.tlId ||
                          !bozza.direttrice.trim() ||
                          !bozza.prodotto.trim()
                        }
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase hover:bg-slate-800 disabled:bg-slate-300"
                      >
                        <Link2 className="w-3 h-3" /> {inCorso ? 'Salvataggio…' : 'Salva'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {materieSenzaTl.length > 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Senza TS: {materieSenzaTl.map((m) => m.nome).join(', ')}. I codici di queste materie
          restano fuori dal report per unità operativa finché non applicano una lavorazione.
        </p>
      )}
    </div>
  );
}
