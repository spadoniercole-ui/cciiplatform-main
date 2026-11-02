'use client';

// LE TL DI UN PRODOTTO — direttrice + prodotto (0.157.0).
//
// Le TL si scrivono qui, dove il lavoro si organizza: un prodotto (DURC, Cassa
// Integrazione, verbale) e le lavorazioni con cui l'ente lo tratta, con
// l'ufficio, i passi, l'esito e il contrassegno di perimetro. La materia, al
// passo successivo, le eredita associandole ai propri codici: una TL scritta
// una volta sola.
//
// Il componente vive dentro la scheda della direttrice, sotto il prodotto a cui
// appartiene. Il salvataggio ricarica il catalogo del genitore: la catena
// (direttrici → lavorazioni → titoli) si aggiorna insieme.

import React, { useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { eliminaTlProdottoAction, salvaTlProdottoAction } from '@/app/actions/materieLavorazione';
import { CampoPerimetroTl } from '@/components/spazio/CampoPerimetroTl';
import { AnteprimaPassi } from '@/components/spazio/TitoliEnteManager';
import {
  MASSIMO_CARATTERI_ESITO,
  MASSIMO_CARATTERI_TIPOLOGIA,
} from '@/lib/titoliEnte/lavorazioniMateria';
import {
  MASSIMO_CARATTERI_ATTIVITA_RECUPERO,
  MASSIMO_CARATTERI_DIPENDENZA,
} from '@/lib/titoliEnte/recupero';
import type { InputTlProdotto, TlProdotto } from '@/lib/titoliEnte/prodottiTl';

interface Props {
  nomeSchema: string;
  direttrice: string;
  prodotto: string;
  voci: TlProdotto[];
  /** Gli uffici scegliibili: le direttrici configurate. */
  uffici: string[];
  /** Ricarica catalogo e catena del genitore. */
  onCambia: () => Promise<void> | void;
}

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

const vuota = (direttrice: string, prodotto: string): InputTlProdotto => ({
  id: null,
  direttrice,
  prodotto,
  tipologia: '',
  dipendenza: direttrice || null,
  procedura: null,
  esito: null,
  rilevantePerimetro: false,
  versoPerimetro: null,
});

export function TlDelProdotto({ nomeSchema, direttrice, prodotto, voci, uffici, onCambia }: Props) {
  const [bozza, setBozza] = useState<InputTlProdotto | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const apri = (voce?: TlProdotto) =>
    setBozza(
      voce
        ? {
            id: voce.id,
            direttrice: voce.direttrice,
            prodotto: voce.prodotto,
            tipologia: voce.tipologia,
            dipendenza: voce.dipendenza,
            procedura: voce.procedura,
            esito: voce.esito,
            rilevantePerimetro: voce.rilevantePerimetro,
            versoPerimetro: voce.versoPerimetro,
          }
        : vuota(direttrice, prodotto)
    );

  const salva = async () => {
    if (!bozza) return;
    setInCorso(true);
    setErrore(null);
    const r = await salvaTlProdottoAction(nomeSchema, bozza);
    if (!r.success) setErrore(r.error ?? 'Salvataggio non riuscito.');
    else {
      setBozza(null);
      await onCambia();
    }
    setInCorso(false);
  };

  const elimina = async (voce: TlProdotto) => {
    if (
      !window.confirm(
        `Eliminare la TL «${voce.tipologia}»? Spariscono anche le associazioni alle materie.`
      )
    )
      return;
    setInCorso(true);
    setErrore(null);
    const r = await eliminaTlProdottoAction(nomeSchema, voce.id);
    if (!r.success) setErrore(r.error ?? 'Eliminazione non riuscita.');
    else await onCambia();
    setInCorso(false);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          TL del prodotto — {voci.length === 0 ? 'nessuna' : voci.length}
        </span>
        <button
          type="button"
          onClick={() => apri()}
          disabled={inCorso || bozza !== null}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold text-[9px] uppercase tracking-wider"
        >
          <Plus className="w-3 h-3" /> Aggiungi TL
        </button>
      </div>

      {voci.length === 0 ? (
        <p className="px-2.5 py-2 text-[10px] text-slate-500 leading-relaxed">
          Nessuna TL: aggiungi quella con cui l’ente lavora questo prodotto. La materia la erediterà
          al passo 2, senza riscriverla.
        </p>
      ) : (
        <table className="w-full text-[10px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-slate-400 text-left">
              <th className="px-2.5 py-1 font-bold">TL</th>
              <th className="py-1 font-bold">Esito</th>
              <th className="py-1 font-bold">Ufficio</th>
              <th className="py-1 font-bold text-center">Perimetro</th>
              <th className="py-1 font-bold text-right">Materie</th>
              <th className="px-2.5 py-1" />
            </tr>
          </thead>
          <tbody>
            {voci.map((v) => (
              <tr key={v.id} className="border-t border-slate-100 align-top">
                <td className="px-2.5 py-1.5 text-slate-800 font-bold">{v.tipologia}</td>
                <td className="py-1.5 text-slate-600">{v.esito ?? '—'}</td>
                <td className="py-1.5 text-slate-600">{v.dipendenza ?? 'senza ufficio'}</td>
                <td className="py-1.5 text-center">
                  {v.rilevantePerimetro ? (
                    <span
                      className={`text-[9px] font-bold uppercase rounded px-1 py-0.5 ${
                        v.versoPerimetro === 'RESISTENZA'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {v.versoPerimetro === 'RESISTENZA' ? 'Resistenza' : 'Collaborativa'}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td
                  className={`py-1.5 text-right tabular-nums ${
                    v.materie === 0 ? 'text-amber-800 font-bold' : 'text-slate-600'
                  }`}
                >
                  {v.materie === 0 ? 'nessuna' : v.materie}
                </td>
                <td className="px-2.5 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => apri(v)}
                      disabled={inCorso}
                      className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40"
                      aria-label={`Modifica ${v.tipologia}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void elimina(v)}
                      disabled={inCorso}
                      className="p-1 rounded text-slate-400 hover:text-red-700 hover:bg-red-50 disabled:opacity-40"
                      aria-label={`Elimina ${v.tipologia}`}
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

      {errore && <p className="px-2.5 py-1.5 text-[10px] text-red-700">{errore}</p>}

      {bozza && (
        <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-2.5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <label className="md:col-span-5 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              TL
              <input
                type="text"
                value={bozza.tipologia}
                onChange={(e) => setBozza({ ...bozza, tipologia: e.target.value })}
                placeholder="Es. emissione della diffida"
                className={`${CLASSE} mt-0.5`}
                autoFocus
              />
              <span className="text-[9px] text-slate-400">
                {bozza.tipologia.length} / {MASSIMO_CARATTERI_TIPOLOGIA}
              </span>
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
              <span className="text-[9px] text-slate-400">
                {bozza.tipologia.length} / {MASSIMO_CARATTERI_ESITO}
              </span>
            </label>
            <label className="md:col-span-4 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Ufficio che la esegue
              {uffici.length === 0 ? (
                <input
                  type="text"
                  value={bozza.dipendenza ?? ''}
                  onChange={(e) => setBozza({ ...bozza, dipendenza: e.target.value || null })}
                  placeholder="Es. Ufficio Recupero Crediti"
                  className={`${CLASSE} mt-0.5`}
                />
              ) : (
                <select
                  value={bozza.dipendenza ?? ''}
                  onChange={(e) => setBozza({ ...bozza, dipendenza: e.target.value || null })}
                  className={`${CLASSE} mt-0.5`}
                >
                  <option value="">Senza ufficio</option>
                  <optgroup label="Direttrici dell’ente">
                    {uffici.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </optgroup>
                  {/* Un ufficio già scritto che non è (più) una direttrice resta
                      scegliibile: nessuno perde la configurazione che aveva. */}
                  {bozza.dipendenza &&
                    !uffici.some(
                      (u) => u.trim().toLowerCase() === bozza.dipendenza!.trim().toLowerCase()
                    ) && (
                      <optgroup label="Valore attuale, fuori elenco">
                        <option value={bozza.dipendenza}>{bozza.dipendenza}</option>
                      </optgroup>
                    )}
                </select>
              )}
            </label>
            <label className="md:col-span-12 text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Passi — uno per riga
              <textarea
                value={bozza.procedura ?? ''}
                onChange={(e) => setBozza({ ...bozza, procedura: e.target.value || null })}
                rows={3}
                placeholder={
                  '1. Verificare il messaggio sul cassetto bidirezionale\n2. Acquisire la proposta'
                }
                className={`${CLASSE} mt-0.5 leading-relaxed`}
              />
              <span className="text-[9px] text-slate-400">
                {(bozza.procedura ?? '').length} / {MASSIMO_CARATTERI_ATTIVITA_RECUPERO} · ufficio
                max {MASSIMO_CARATTERI_DIPENDENZA}
              </span>
            </label>
          </div>
          <CampoPerimetroTl
            rilevante={bozza.rilevantePerimetro === true}
            verso={bozza.versoPerimetro ?? null}
            onChange={(patch) => setBozza({ ...bozza, ...patch })}
          />
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
              disabled={inCorso || !bozza.tipologia.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase hover:bg-slate-800 disabled:bg-slate-300"
            >
              <Save className="w-3 h-3" /> {inCorso ? 'Salvataggio…' : 'Salva TL'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
