'use client';

// LA MATERIA DI UNA VOCE SI CAMBIA QUI, DAL REPORT CHE LA MOSTRA SBAGLIATA.
//
// La deduzione automatica legge la voce del V.E.R.A. («Verbale Evasione», «F24
// non presentato», un codice di partita) e ne ricava la materia; la mappatura
// di sezione resta il ripiego per ciò che la voce non dice. Quando la lettura
// sbaglia, però, non c'è nessun posto dove correggerla: la mappatura della
// sezione non può nulla — le voci si riconducono già da sole, e il report lo
// dichiara — e la voce non si modifica nel file.
//
// Qui si dice, una volta per voce, quale materia le compete. La scelta è dello
// SPAZIO: una voce si legge allo stesso modo in tutte le aziende. Vince su ogni
// deduzione, perché è una decisione e non un'ipotesi, e al salvataggio si
// applica alle righe già lette: il report si ricompone e la posizione va
// all'ufficio giusto senza rifare il triage.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers, X } from 'lucide-react';
import { salvaMaterieVociVeraAction } from '@/app/actions/posizioneVera';
import { ottieniMaterieEnteAction } from '@/app/actions/titoliEnte';
import { chiaveVoceVera } from '@/lib/titoliEnte/materiaVera';
import { formattaImportoEuro } from '@/lib/lavorazioni/comunicazioni';

/** Una voce del file che il report sta mandando a un ufficio, e la materia oggi. */
export interface VoceDaRimappare {
  sezione: string;
  voce: string;
  righe: number;
  importo: number;
  /** Il nome della materia che l'accompagna adesso (null = nessuna). */
  materiaAttuale: string | null;
  /** La materia scelta in passato su questa voce, se c'è. */
  materiaScelta: number | null;
}

interface Props {
  nomeSchema: string;
  voci: VoceDaRimappare[];
  onChiudi: () => void;
  /** chiave «sezione|voce» → id della materia; 0 = torna alla deduzione automatica. */
  onSalvate: (scelte: Record<string, number>) => void;
}

export function MateriaVociVera({ nomeSchema, voci, onChiudi, onSalvate }: Props) {
  const [materie, setMaterie] = useState<{ id: number; nome: string }[]>([]);
  const [scelte, setScelte] = useState<Record<string, number>>(() => {
    const iniziali: Record<string, number> = {};
    for (const v of voci) {
      if (v.materiaScelta !== null) iniziali[chiaveVoceVera(v.sezione, v.voce)] = v.materiaScelta;
    }
    return iniziali;
  });
  const [caricamento, setCaricamento] = useState(true);
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const m = await ottieniMaterieEnteAction(nomeSchema);
        if (!vivo) return;
        if (m.success) {
          setMaterie(
            m.materie
              .filter((x): x is typeof x & { id: number } => x.id !== null)
              .map((x) => ({ id: x.id, nome: x.nome }))
          );
        } else {
          setErrore(m.error ?? 'Materie non caricate.');
        }
      } catch (e) {
        if (vivo) setErrore(`Materie non caricate: ${String(e)}`);
      } finally {
        if (vivo) setCaricamento(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [nomeSchema]);

  const cambiate = useMemo(
    () =>
      voci.filter((v) => {
        const k = chiaveVoceVera(v.sezione, v.voce);
        const scelta = scelte[k] ?? 0;
        return scelta !== (v.materiaScelta ?? 0);
      }),
    [voci, scelte]
  );

  const salva = async () => {
    if (cambiate.length === 0) {
      onSalvate(scelte);
      return;
    }
    setInSalvataggio(true);
    setErrore(null);
    try {
      const r = await salvaMaterieVociVeraAction(
        nomeSchema,
        cambiate.map((v) => ({
          sezione: v.sezione,
          voce: v.voce,
          materiaId: scelte[chiaveVoceVera(v.sezione, v.voce)] ?? 0,
        }))
      );
      if (!r.success) {
        setErrore(r.error ?? 'Scelta non salvata.');
        return;
      }
      onSalvate(scelte);
    } catch (e) {
      setErrore(`Scelta non salvata: ${String(e)}`);
    } finally {
      setInSalvataggio(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4"
      role="presentation"
      onClick={() => !inSalvataggio && onChiudi()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="materia-voci-titolo"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto my-8 w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xl p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              id="materia-voci-titolo"
              className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider"
            >
              <Layers className="w-4 h-4 text-slate-500" />
              La materia di ogni voce
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Cambia la materia di una voce quando la lettura del file la manda all&apos;ufficio
              sbagliato. La scelta vale per lo spazio — non per questa azienda — e al salvataggio si
              applica alle posizioni già lette, così il report si ricompone subito.
            </p>
          </div>
          <button
            type="button"
            onClick={onChiudi}
            disabled={inSalvataggio}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            aria-label="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {caricamento ? (
          <p className="text-[11px] text-slate-500">Caricamento delle materie…</p>
        ) : (
          <ul className="space-y-2">
            {voci.map((v) => {
              const k = chiaveVoceVera(v.sezione, v.voce);
              const scelta = scelte[k] ?? 0;
              const sceltaValida = v.materiaScelta !== null ? v.materiaScelta : 0;
              return (
                <li key={k} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      {v.voce || 'voce senza denominazione'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {v.righe} {v.righe === 1 ? 'posizione' : 'posizioni'} ·{' '}
                      {formattaImportoEuro(v.importo)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Sezione «{v.sezione}»
                  </p>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    <span className="font-bold">Ora:</span>{' '}
                    {v.materiaAttuale ?? 'nessuna materia riconosciuta'}
                  </p>
                  <select
                    aria-label={`Materia di ${v.voce}`}
                    value={sceltaValida}
                    onChange={(e) => setScelte({ ...scelte, [k]: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white"
                  >
                    <option value={0}>Riconduci da sé (come ora)</option>
                    {materie.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                  {scelta !== sceltaValida && (
                    <p className="text-[10px] text-sky-800 leading-relaxed">
                      Da salvare:{' '}
                      {materie.find((m) => m.id === scelta)?.nome ?? 'riconduzione automatica'}.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {errore && (
          <p className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {errore}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-[10px] text-slate-400 leading-relaxed max-w-sm">
            «Riconduci da sé» toglie la scelta e restituisce la voce alla lettura del file.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onChiudi}
              disabled={inSalvataggio}
              className="px-3 py-2 rounded-lg border border-slate-300 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => void salva()}
              disabled={inSalvataggio || caricamento || voci.length === 0}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
            >
              {inSalvataggio ? 'Salvataggio…' : 'Salva e aggiorna il report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
