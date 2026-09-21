'use client';

// Pannello di mappatura di un prospetto non riconosciuto.
//
// Chi carica un file che la piattaforma non conosce indica una volta come
// leggerlo. La piattaforma PROPONE gli abbinamenti dai nomi delle
// intestazioni, ma non li applica da sé: la lettura del documento resta di
// chi lo conosce.
//
// Prima di aggiungere le righe alla tabella si mostra l'esito — quante righe,
// quali scartate e perché, quali anni restano fuori — così nulla entra nel
// calcolo senza essere stato visto.

import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  estraiRighe,
  firmaIntestazioni,
  type FormaProspetto,
  type MappaturaProspetto,
} from '@/lib/debitiTriage/mappatura';
import { CATEGORIE, type CategoriaDebito, type RigaDebitoTriage } from '@/lib/debitiTriage/modello';

export const ENTI_PROSPETTO: { valore: string; etichetta: string }[] = [
  { valore: 'INPS', etichetta: 'INPS' },
  { valore: 'INAIL', etichetta: 'INAIL' },
  { valore: 'AGENZIA_ENTRATE', etichetta: 'Agenzia delle Entrate' },
  { valore: 'AGENZIA_RISCOSSIONE', etichetta: 'Agenzia Entrate-Riscossione' },
  { valore: 'ALTRO', etichetta: 'Altro creditore' },
];

interface Props {
  nomeFile: string;
  aoa: unknown[][];
  proposta: MappaturaProspetto;
  anni: { corrente: number; precedente: number; meno2: number };
  onApplica: (esito: {
    righe: RigaDebitoTriage[];
    ente: string;
    mappatura: MappaturaProspetto;
    firma: string;
  }) => void;
  onAnnulla: () => void;
}

const CLASSE =
  'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500';

export function PannelloMappatura({ nomeFile, aoa, proposta, anni, onApplica, onAnnulla }: Props) {
  const [m, setM] = useState<MappaturaProspetto>(proposta);
  const [ente, setEnte] = useState('');
  const [categoriaDaColonna, setCategoriaDaColonna] = useState(proposta.colCategoria !== null);

  const intestazione = (aoa[m.rigaIntestazione] ?? []).map((c) => String(c ?? ''));
  const anteprima = aoa.slice(m.rigaIntestazione + 1, m.rigaIntestazione + 6);
  const colonne = intestazione.map((t, i) => ({ i, t: t || `Colonna ${i + 1}` }));

  // I valori distinti della colonna categoria, da tradurre uno per uno.
  const valoriCategoria = useMemo(() => {
    if (!categoriaDaColonna || m.colCategoria === null) return [];
    const set = new Set<string>();
    for (const r of aoa.slice(m.rigaIntestazione + 1)) {
      const v = String(r?.[m.colCategoria] ?? '')
        .trim()
        .toLowerCase();
      if (v) set.add(v);
    }
    return [...set].slice(0, 30);
  }, [aoa, m.colCategoria, m.rigaIntestazione, categoriaDaColonna]);

  const mappaturaEffettiva: MappaturaProspetto = {
    ...m,
    colCategoria: categoriaDaColonna ? m.colCategoria : null,
  };
  const esito = estraiRighe(aoa, mappaturaEffettiva, anni, null, nomeFile);
  const pronto = ente !== '' && esito.righe.length > 0;

  const scegliColonna = (v: string) => (v === '' ? null : Number(v));

  return (
    <div className="space-y-4 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
      <div>
        <p className="text-xs font-bold text-slate-900">Come si legge «{nomeFile}»?</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          La piattaforma ha proposto gli abbinamenti dai nomi delle colonne: controllali e
          correggili. Si fa una volta sola — la prossima volta lo stesso tracciato dello stesso ente
          si riconoscerà da solo.
        </p>
      </div>

      {/* Anteprima delle prime righe, con i nomi delle colonne. */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-slate-50">
              {colonne.map((c) => (
                <th
                  key={c.i}
                  className="whitespace-nowrap px-2 py-1 text-left font-bold text-slate-600"
                >
                  {c.t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {anteprima.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {colonne.map((c) => (
                  <td key={c.i} className="whitespace-nowrap px-2 py-1 font-mono text-slate-700">
                    {String(r?.[c.i] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Di quale ente è il prospetto
          <select
            value={ente}
            onChange={(e) => setEnte(e.target.value)}
            className={`${CLASSE} mt-1 w-full`}
          >
            <option value="">Scegli…</option>
            {ENTI_PROSPETTO.map((x) => (
              <option key={x.valore} value={x.valore}>
                {x.etichetta}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Forma del prospetto
          <select
            value={m.forma}
            onChange={(e) => setM({ ...m, forma: e.target.value as FormaProspetto })}
            className={`${CLASSE} mt-1 w-full`}
          >
            <option value="RIEPILOGO">Riepilogo — una colonna per anno</option>
            <option value="DETTAGLIO">Dettaglio — una riga per movimento, con una data</option>
          </select>
        </label>
      </div>

      {m.forma === 'RIEPILOGO' ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Colonne degli anni
          </p>
          <div className="mt-1 flex flex-wrap gap-3">
            {colonne.map((c) => (
              <label key={c.i} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={m.colonneAnno.includes(c.i)}
                  onChange={(e) =>
                    setM({
                      ...m,
                      colonneAnno: e.target.checked
                        ? [...m.colonneAnno, c.i]
                        : m.colonneAnno.filter((x) => x !== c.i),
                    })
                  }
                />
                {c.t}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            L&apos;anno si legge dal nome della colonna. Contano solo {anni.corrente},{' '}
            {anni.precedente} e {anni.meno2}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Colonna della data o del periodo
            <select
              value={m.colData ?? ''}
              onChange={(e) => setM({ ...m, colData: scegliColonna(e.target.value) })}
              className={`${CLASSE} mt-1 w-full`}
            >
              <option value="">—</option>
              {colonne.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Colonna dell&apos;importo
            <select
              value={m.colImporto ?? ''}
              onChange={(e) => setM({ ...m, colImporto: scegliColonna(e.target.value) })}
              className={`${CLASSE} mt-1 w-full`}
            >
              <option value="">—</option>
              {colonne.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.t}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {m.forma === 'RIEPILOGO' && (
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Colonna della descrizione (facoltativa)
          <select
            value={m.colDescrizione ?? ''}
            onChange={(e) => setM({ ...m, colDescrizione: scegliColonna(e.target.value) })}
            className={`${CLASSE} mt-1 w-full sm:w-1/2`}
          >
            <option value="">—</option>
            {colonne.map((c) => (
              <option key={c.i} value={c.i}>
                {c.t}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* La categoria: per tutto il file, oppure da una colonna. */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Categoria</p>
        <div className="flex flex-wrap gap-4 text-[11px] text-slate-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={!categoriaDaColonna}
              onChange={() => setCategoriaDaColonna(false)}
            />
            Tutto il file è di una categoria
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={categoriaDaColonna}
              onChange={() => setCategoriaDaColonna(true)}
            />
            La categoria cambia riga per riga
          </label>
        </div>

        {!categoriaDaColonna ? (
          <select
            value={m.categoriaFile ?? ''}
            onChange={(e) =>
              setM({ ...m, categoriaFile: (e.target.value || null) as CategoriaDebito | null })
            }
            className={`${CLASSE} w-full sm:w-1/2`}
          >
            <option value="">Scegli…</option>
            {CATEGORIE.map((c) => (
              <option key={c.codice} value={c.codice}>
                {c.etichetta}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-2">
            <select
              value={m.colCategoria ?? ''}
              onChange={(e) => setM({ ...m, colCategoria: scegliColonna(e.target.value) })}
              className={`${CLASSE} w-full sm:w-1/2`}
            >
              <option value="">Colonna che indica la natura…</option>
              {colonne.map((c) => (
                <option key={c.i} value={c.i}>
                  {c.t}
                </option>
              ))}
            </select>
            {valoriCategoria.length > 0 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {valoriCategoria.map((v) => (
                  <label key={v} className="flex items-center gap-2 text-[11px] text-slate-700">
                    <span className="w-1/2 truncate font-mono">{v}</span>
                    <select
                      value={m.mappaCategorie[v] ?? ''}
                      onChange={(e) =>
                        setM({
                          ...m,
                          mappaCategorie: {
                            ...m.mappaCategorie,
                            [v]: e.target.value as CategoriaDebito,
                          },
                        })
                      }
                      className={`${CLASSE} w-1/2`}
                    >
                      <option value="">non usare</option>
                      {CATEGORIE.map((c) => (
                        <option key={c.codice} value={c.codice}>
                          {c.etichetta}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* L'esito, PRIMA di aggiungere: nulla entra nel calcolo senza essere visto. */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] text-slate-700">
        <p className="font-bold">
          {esito.righe.length === 0
            ? 'Con queste scelte non si estrae nessuna posizione.'
            : `Si estraggono ${esito.righe.length} posizioni.`}
        </p>
        {esito.scartate.map((s) => (
          <p key={s.motivo} className="text-slate-500">
            — {s.quante} righe scartate: {s.motivo}.
          </p>
        ))}
        {esito.anniFuoriFinestra.length > 0 && (
          <p className="text-slate-500">
            — Anni presenti ma fuori dai tre del triage: {esito.anniFuoriFinestra.join(', ')}.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() =>
            onApplica({
              righe: esito.righe,
              ente,
              mappatura: mappaturaEffettiva,
              firma: firmaIntestazioni(aoa[m.rigaIntestazione] ?? []),
            })
          }
          disabled={!pronto}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:bg-slate-300"
        >
          <Check className="h-3.5 w-3.5" />
          Aggiungi alla tabella
        </button>
        <button
          onClick={onAnnulla}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50"
        >
          <X className="h-3.5 w-3.5" />
          Annulla
        </button>
        {!ente && (
          <span className="self-center text-[10px] text-slate-400">Scegli l&apos;ente.</span>
        )}
      </div>
    </div>
  );
}
