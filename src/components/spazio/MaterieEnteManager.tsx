'use client';

// Materie dell'ente — il riquadro sopra i codici. Flusso (Ercole, 0.109.98):
// sito → elenco delle materie (con codici indicativi, non vincolanti) →
// «Ho caricato tutte le materie: avvia la ricerca» → l'AI propone in blocco,
// una materia alla volta con avanzamento → una persona conferma.

import React, { useEffect, useState } from 'react';
import { BookMarked, Plus, Trash2, Search, ExternalLink, Check, Pencil } from 'lucide-react';
import {
  confermaMateriaEnteAction,
  eliminaMateriaEnteAction,
  ottieniMaterieEnteAction,
  ricercaMateriaAction,
  salvaMateriaEnteAction,
} from '@/app/actions/titoliEnte';
import { ETICHETTA_STATO_MATERIA, type MateriaEnte } from '@/lib/titoliEnte/materie';
import { confermaApp } from '@/components/FinestreApp';

const CLASSE_CAMPO =
  'w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 disabled:text-slate-500';

interface Props {
  nomeSchema: string;
  codice: string;
  dominioEnte: string | null;
  /** Le materie cambiano: chi le usa (i codici) si aggiorna. */
  onCambiate?: () => void;
}

export function MaterieEnteManager({ nomeSchema, codice, dominioEnte, onCambiate }: Props) {
  const [materie, setMaterie] = useState<MateriaEnte[]>([]);
  const [nuova, setNuova] = useState({ nome: '', codiciIndicativi: '' });
  const [inModifica, setInModifica] = useState<MateriaEnte | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState<{
    fatte: number;
    totale: number;
    corrente: string;
  } | null>(null);
  const [conferma, setConferma] = useState<{
    id: number;
    presupposto: string;
    riferimenti: string;
  } | null>(null);

  const carica = async () => {
    const r = await ottieniMaterieEnteAction(nomeSchema);
    if (r.success) setMaterie(r.materie);
    else setErrore(r.error ?? 'Lettura non riuscita.');
    onCambiate?.();
  };
  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const salvaNuova = async () => {
    const nomi = nuova.nome
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (nomi.length === 0) return;
    // Una materia con tre nomi non e' una materia: con le virgole si chiede.
    if (nomi.length > 1) {
      const ok = await confermaApp(
        `Il nome contiene ${nomi.length} voci separate da virgola: ${nomi.map((n) => `«${n}»`).join(', ')}. Creare ${nomi.length} materie distinte? I codici indicativi, se presenti, andranno solo alla prima.`,
        { titolo: 'Più materie in un nome', etichettaConferma: `Crea ${nomi.length} materie` }
      );
      if (!ok) return;
    }
    for (const [i, nome] of nomi.entries()) {
      if (materie.some((m) => m.nome.trim().toLowerCase() === nome.toLowerCase())) {
        setErrore(
          `Esiste già una materia «${nome}»: modificala con la matita invece di ricrearla.`
        );
        continue;
      }
      const r = await salvaMateriaEnteAction(codice, {
        id: null,
        nome,
        codiciIndicativi: i === 0 ? nuova.codiciIndicativi || null : null,
      });
      if (!r.success) return setErrore(r.error ?? 'Errore.');
    }
    setNuova({ nome: '', codiciIndicativi: '' });
    setErrore(null);
    await carica();
  };

  const avviaRicerca = async () => {
    const daFare = materie.filter((m) => m.stato !== 'CONFERMATA' && !m.proposta);
    if (daFare.length === 0) {
      setErrore('Nessuna materia da ricercare: tutte hanno già una proposta o sono confermate.');
      return;
    }
    if (!dominioEnte) {
      setErrore('Indicare prima il sito istituzionale dell’ente, qui sopra.');
      return;
    }
    const ok = await confermaApp(
      `Confermi di aver caricato tutte le materie? La ricerca partirà in blocco su ${daFare.length} ${daFare.length === 1 ? 'materia' : 'materie'}, sul sito ${dominioEnte} e sulle fonti ufficiali. Può richiedere alcuni minuti; le proposte restano «da confermare» finché non le approvi.`,
      { titolo: 'Avvio della ricerca', etichettaConferma: 'Avvia la ricerca' }
    );
    if (!ok) return;
    setErrore(null);
    let i = 0;
    const errori: string[] = [];
    for (const m of daFare) {
      setRicerca({ fatte: i, totale: daFare.length, corrente: m.nome });
      const r = await ricercaMateriaAction(codice, m.id!);
      if (!r.success) errori.push(`${m.nome}: ${r.error}`);
      i += 1;
    }
    setRicerca(null);
    if (errori.length)
      setErrore(
        `Ricerca completata con ${errori.length} ${errori.length === 1 ? 'materia' : 'materie'} senza esito — ${errori[0]}`
      );
    await carica();
  };

  return (
    <section className="space-y-3" aria-label="Materie dell’ente">
      <div className="flex items-start gap-2">
        <BookMarked className="w-4 h-4 text-blue-600 mt-0.5" />
        <div>
          <h3 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
            Materie da riscontrare
          </h3>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Le materie su cui l’ente fonda il recupero (denunce Uniemens, note di rettifica,
            dilazioni, variazioni dei flussi, verbali ispettivi, diffide…). Per ciascuna l’AI cerca
            sul sito dell’ente circolari e messaggi, risale alla norma che citano e propone; una
            persona conferma. I codici dell’anagrafica cadono nella materia.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
        <div className="sm:col-span-2">
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
            Materia
          </label>
          <input
            value={nuova.nome}
            onChange={(e) => setNuova({ ...nuova, nome: e.target.value })}
            placeholder="es. Denunce Uniemens e flussi mensili"
            className={CLASSE_CAMPO}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">
            Codici indicativi (facoltativi, non vincolanti)
          </label>
          <input
            value={nuova.codiciIndicativi}
            onChange={(e) => setNuova({ ...nuova, codiciIndicativi: e.target.value })}
            placeholder="es. 27, 10"
            className={CLASSE_CAMPO}
          />
        </div>
        <button
          type="button"
          onClick={salvaNuova}
          disabled={!nuova.nome.trim()}
          className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" /> Aggiungi materia
        </button>
      </div>

      {errore && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {errore}
        </p>
      )}

      {materie.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={avviaRicerca}
            disabled={ricerca !== null}
            className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold text-[10px] uppercase rounded-lg"
          >
            <Search className="w-3.5 h-3.5" /> Ho caricato tutte le materie: avvia la ricerca
          </button>
          {ricerca && (
            <span className="text-[11px] text-slate-700">
              Ricerca in corso: {ricerca.fatte + 1} di {ricerca.totale} — «{ricerca.corrente}»
            </span>
          )}
        </div>
      )}

      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {materie.length === 0 && (
          <li className="p-3 text-xs text-slate-500">
            Nessuna materia ancora: aggiungile qui sopra, poi avvia la ricerca.
          </li>
        )}
        {materie.map((m) => (
          <li key={m.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                {inModifica?.id === m.id ? (
                  <div className="flex gap-2 items-end">
                    <input
                      value={inModifica.nome}
                      onChange={(e) => setInModifica({ ...inModifica, nome: e.target.value })}
                      className={CLASSE_CAMPO}
                    />
                    <input
                      value={inModifica.codiciIndicativi ?? ''}
                      onChange={(e) =>
                        setInModifica({ ...inModifica, codiciIndicativi: e.target.value })
                      }
                      className={CLASSE_CAMPO}
                      placeholder="codici indicativi"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await salvaMateriaEnteAction(codice, {
                          id: m.id,
                          nome: inModifica.nome,
                          codiciIndicativi: inModifica.codiciIndicativi,
                        });
                        if (!r.success) setErrore(r.error ?? 'Errore.');
                        setInModifica(null);
                        await carica();
                      }}
                      className="px-2 py-2 text-[10px] font-bold uppercase text-blue-700 whitespace-nowrap"
                    >
                      Salva
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="text-xs font-bold text-slate-900">{m.nome}</span>
                    {m.codiciIndicativi && (
                      <span className="text-[10px] text-slate-500 ml-2">
                        codici indicativi: {m.codiciIndicativi}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${m.stato === 'CONFERMATA' ? 'bg-emerald-100 text-emerald-800' : m.stato === 'PROPOSTA' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
                >
                  {ETICHETTA_STATO_MATERIA[m.stato]}
                </span>
                <button
                  type="button"
                  onClick={() => setInModifica(m)}
                  className="text-slate-400 hover:text-blue-700"
                  title="Modifica"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !(await confermaApp(
                        `Eliminare la materia «${m.nome}»? I codici assegnati torneranno «da assegnare».`,
                        { distruttiva: true, etichettaConferma: 'Elimina' }
                      ))
                    )
                      return;
                    const r = await eliminaMateriaEnteAction(codice, m.id!);
                    if (!r.success) setErrore(r.error ?? 'Errore.');
                    await carica();
                  }}
                  className="text-slate-400 hover:text-red-600"
                  title="Elimina"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {m.stato === 'CONFERMATA' && (
              <div className="text-[11px] text-slate-700">
                <span className="text-slate-500">Presupposto: </span>
                {m.presuppostoGiuridico}
                {m.riferimentiInterni && (
                  <span className="block">
                    <span className="text-slate-500">Riferimenti: </span>
                    {m.riferimentiInterni}
                  </span>
                )}
                <span className="block text-[10px] text-slate-400">
                  confermata da {m.confermataDa}
                  {m.confermataIl
                    ? ` il ${new Date(m.confermataIl).toLocaleDateString('it-IT')}`
                    : ''}
                </span>
              </div>
            )}

            {m.stato !== 'CONFERMATA' && m.proposta && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2 text-[11px]">
                <p className="font-bold text-amber-900">
                  Proposta dell’AI del {new Date(m.proposta.generataIl).toLocaleDateString('it-IT')}
                  {m.proposta.conFonteUfficiale
                    ? ' — con almeno una fonte ufficiale'
                    : ' — senza fonti ufficiali fra i link'}
                </p>
                {m.proposta.sintesi && <p className="text-slate-700">{m.proposta.sintesi}</p>}
                {m.proposta.presupposti.length > 0 && (
                  <ul className="space-y-0.5">
                    {m.proposta.presupposti.map((p, i) => (
                      <li key={i} className="text-slate-800">
                        <strong>{p.norma}</strong>
                        {p.estratto && (
                          <span className="italic text-slate-600"> — «{p.estratto}»</span>
                        )}
                        {p.url && (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 inline-flex items-center gap-0.5 text-blue-700"
                          >
                            <ExternalLink className="w-3 h-3" />
                            fonte
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {m.proposta.riferimenti.length > 0 && (
                  <ul className="space-y-0.5">
                    {m.proposta.riferimenti.map((r, i) => (
                      <li key={i} className="text-slate-800">
                        {r.tipo} {r.estremi}
                        {r.titolo ? ` — ${r.titolo}` : ''}
                        {r.url && (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 inline-flex items-center gap-0.5 text-blue-700"
                          >
                            <ExternalLink className="w-3 h-3" />
                            apri
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {conferma?.id === m.id ? (
                  <div className="space-y-2 pt-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">
                      Presupposto giuridico (correggibile)
                    </label>
                    <input
                      value={conferma.presupposto}
                      onChange={(e) => setConferma({ ...conferma, presupposto: e.target.value })}
                      className={CLASSE_CAMPO}
                    />
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">
                      Riferimenti interni (correggibili)
                    </label>
                    <input
                      value={conferma.riferimenti}
                      onChange={(e) => setConferma({ ...conferma, riferimenti: e.target.value })}
                      className={CLASSE_CAMPO}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await confermaMateriaEnteAction(
                            codice,
                            m.id!,
                            conferma.presupposto,
                            conferma.riferimenti
                          );
                          if (!r.success) setErrore(r.error ?? 'Errore.');
                          setConferma(null);
                          await carica();
                        }}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" /> Confermo
                      </button>
                      <button
                        type="button"
                        onClick={() => setConferma(null)}
                        className="px-3 py-2 text-[10px] font-bold uppercase text-slate-500"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setConferma({
                        id: m.id!,
                        presupposto: m.proposta!.presupposti.map((p) => p.norma).join('; '),
                        riferimenti: m
                          .proposta!.riferimenti.map((r) => `${r.tipo} ${r.estremi}`)
                          .join('; '),
                      })
                    }
                    className="px-3 py-2 bg-white border border-amber-300 text-amber-900 font-bold text-[10px] uppercase rounded-lg"
                  >
                    Rivedi e conferma
                  </button>
                )}
              </div>
            )}
            {m.stato !== 'CONFERMATA' && !m.proposta && (
              <div className="space-y-1">
                {m.esitoRicerca ? (
                  <p className="text-[11px] text-amber-800">{m.esitoRicerca}</p>
                ) : (
                  <p className="text-[10px] text-slate-500">In attesa della ricerca.</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={ricerca !== null}
                    onClick={async () => {
                      setRicerca({ fatte: 0, totale: 1, corrente: m.nome });
                      const r = await ricercaMateriaAction(codice, m.id!);
                      setRicerca(null);
                      if (!r.success) setErrore(r.error ?? 'Errore.');
                      await carica();
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-100 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
                  >
                    Cerca di nuovo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConferma({
                        id: m.id!,
                        presupposto: m.presuppostoGiuridico ?? '',
                        riferimenti: m.riferimentiInterni ?? '',
                      })
                    }
                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg"
                  >
                    Compila a mano
                  </button>
                </div>
                {conferma?.id === m.id && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">
                      Presupposto giuridico
                    </label>
                    <input
                      value={conferma.presupposto}
                      onChange={(e) => setConferma({ ...conferma, presupposto: e.target.value })}
                      className={CLASSE_CAMPO}
                    />
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">
                      Riferimenti interni
                    </label>
                    <input
                      value={conferma.riferimenti}
                      onChange={(e) => setConferma({ ...conferma, riferimenti: e.target.value })}
                      className={CLASSE_CAMPO}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await confermaMateriaEnteAction(
                            codice,
                            m.id!,
                            conferma.presupposto,
                            conferma.riferimenti
                          );
                          if (!r.success) setErrore(r.error ?? 'Errore.');
                          setConferma(null);
                          await carica();
                        }}
                        className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" /> Confermo
                      </button>
                      <button
                        type="button"
                        onClick={() => setConferma(null)}
                        className="px-3 py-2 text-[10px] font-bold uppercase text-slate-500"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
