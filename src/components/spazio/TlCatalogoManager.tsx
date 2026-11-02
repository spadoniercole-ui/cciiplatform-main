'use client';

// IL CATALOGO DELLE TS — codice, descrizione, flag per la check list (0.159.0).
//
// Una TS si scrive qui, una volta sola. Non sta più dentro il prodotto: la
// stessa lavorazione non va ripetuta per ogni prodotto che la usa, e l'ufficio
// non è una sua proprietà — è il processo con cui una materia la applica a una
// direttrice e a un prodotto (Parametri › Lavorazioni delle materie), e da lì
// arriva al report per unità operativa.
//
// La colonna «check list» è il contrassegno che il triage usa: le TS marcate
// entrano nella check di perimetro obbligatoria.

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import {
  eliminaTlAction,
  ottieniCatalogoTl,
  salvaTlAction,
} from '@/app/actions/materieLavorazione';
import { CampoPerimetroTl } from '@/components/spazio/CampoPerimetroTl';
import {
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
};

export function TlCatalogoManager({ nomeSchema, codice, ritorno }: Props) {
  useDichiaraContestoAssistente({
    pagina: 'parametri',
    nomeSchema,
    sezioneParametri: 'Catalogo delle TS',
  });

  const [catalogo, setCatalogo] = useState<Tl[]>([]);
  const [bozza, setBozza] = useState<InputTl | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const r = await ottieniCatalogoTl(nomeSchema);
    if (r.success) setCatalogo(r.tl);
    else setErrore(r.error || 'Impossibile caricare il catalogo.');
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
            Una TS è un <strong>codice</strong>, una <strong>descrizione</strong> e un{' '}
            <strong>flag per la check list</strong>. Nient&apos;altro: si scrive una volta sola, non
            una volta per prodotto. L&apos;ufficio e i passi sono il processo con cui una{' '}
            <Link
              href={conRitorno(`/spazio/${codice}/parametri/materie-lavorazione`, ritorno)}
              className="font-bold text-sky-700 hover:underline"
            >
              materia
            </Link>{' '}
            la applica a una direttrice e a un prodotto; i{' '}
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
                <th className="py-1.5 font-bold text-center">Check list</th>
                <th className="py-1.5 font-bold text-right">Materie</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {catalogo.map((tl) => (
                <tr key={tl.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-1.5 font-mono font-bold text-slate-800">{tl.codice}</td>
                  <td className="py-1.5 text-slate-700">{tl.descrizione}</td>
                  <td className="py-1.5 text-center">
                    {tl.checkList ? (
                      <span
                        className={`text-[9px] font-bold uppercase rounded px-1 py-0.5 ${
                          tl.versoCheckList === 'RESISTENZA'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {tl.versoCheckList === 'RESISTENZA' ? 'Resistenza' : 'Collaborativa'}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
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
          <CampoPerimetroTl
            rilevante={bozza.checkList === true}
            verso={bozza.versoCheckList ?? null}
            onChange={(patch) =>
              setBozza({
                ...bozza,
                checkList: patch.rilevantePerimetro ?? bozza.checkList,
                versoCheckList:
                  patch.versoPerimetro !== undefined ? patch.versoPerimetro : bozza.versoCheckList,
              })
            }
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
