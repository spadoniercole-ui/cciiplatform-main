'use client';

// LA CHECK DI PERIMETRO DEL TRIAGE — dove l'operatore risponde.
//
// Le voci non si scrivono qui: arrivano dai titoli dell'ente. Ogni TL
// contrassegnata come rilevante è una riga, con i prodotti che la richiamano,
// i codici che quella lavorazione tocca davvero e l'ufficio che la esegue. La
// risposta è obbligatoria; la natura lo è solo quando la TL non è stata
// riscontrata, perché è lì che serve distinguere un incidente da un modus
// operandi.
//
// IL SALVATAGGIO NON CHIUDE NULLA. Si salva anche una check a metà: il triage
// è quello che decide di non elaborare, e lo dice con le mancanze esatte.

import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Save, AlertTriangle, Loader2 } from 'lucide-react';
import {
  ottieniPerimetroTriageAction,
  salvaPerimetroTriageAction,
  type RisultatoPerimetro,
} from '@/app/actions/triagePerimetro';
import {
  ETICHETTA_NATURA,
  ETICHETTA_STATO,
  ETICHETTA_VERSO,
  type NaturaProblema,
  type StatoPerimetro,
  type VocePerimetro,
} from '@/lib/triage/perimetro';

const CLASSE =
  'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500';

interface Props {
  nomeSchema: string;
  aziendaId: number;
  /** Notifica il genitore dell'esito: il triage non si chiude se manca qualcosa. */
  onEsito?: (esito: Pick<RisultatoPerimetro, 'completa' | 'mancanze'>) => void;
}

export function PerimetroTriage({ nomeSchema, aziendaId, onEsito }: Props) {
  const [voci, setVoci] = useState<VocePerimetro[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [mancanze, setMancanze] = useState<string[]>([]);

  const applica = (r: RisultatoPerimetro) => {
    if (!r.success) {
      setErrore(r.error ?? 'Lettura non riuscita.');
      return;
    }
    setVoci(r.voci ?? []);
    setMancanze(r.mancanze ?? []);
    onEsito?.({ completa: r.completa, mancanze: r.mancanze });
  };

  useEffect(() => {
    let annullato = false;
    setCaricamento(true);
    void ottieniPerimetroTriageAction(nomeSchema, aziendaId).then((r) => {
      if (annullato) return;
      applica(r);
      setCaricamento(false);
    });
    return () => {
      annullato = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema, aziendaId]);

  const modifica = (id: number, patch: Partial<VocePerimetro>) => {
    setVoci((prev) =>
      prev.map((v) => {
        if (v.lavorazioneId !== id) return v;
        const aggiornata = { ...v, ...patch };
        // «Riscontrata» e «non applicabile» non hanno una natura da dichiarare:
        // conservarla mostrerebbe una risposta che non si è più data.
        if (aggiornata.stato !== 'NON_RISCONTRATA') aggiornata.natura = null;
        return aggiornata;
      })
    );
    setEsito(null);
  };

  const salva = async () => {
    setSalvataggio(true);
    setErrore(null);
    setEsito(null);
    const r = await salvaPerimetroTriageAction(
      nomeSchema,
      aziendaId,
      voci.map((v) => ({
        lavorazioneId: v.lavorazioneId,
        stato: v.stato,
        natura: v.natura,
        nota: v.nota,
      }))
    );
    applica(r);
    if (r.success) {
      setEsito(
        r.completa
          ? 'Check salvata: tutte le TL rilevanti hanno una risposta.'
          : 'Check salvata, ma restano voci da completare.'
      );
    }
    setSalvataggio(false);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento della check…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900 uppercase text-xs tracking-wider">
            <ClipboardCheck className="w-4 h-4 text-slate-500" />
            Check di perimetro dei crediti
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 max-w-3xl leading-relaxed">
            Le lavorazioni contrassegnate nei Parametri come rilevanti per il perimetro. Per ognuna
            si dice se è stata riscontrata e, quando non lo è, se il problema è momentaneo o è il
            modo in cui l’azienda gestisce il debito. L’importo del debito non c’entra: quello lo
            misurano le soglie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void salva()}
          disabled={salvataggio}
          className="flex items-center gap-1.5 bg-slate-900 text-white px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 disabled:bg-slate-300"
        >
          {salvataggio ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Salva check
        </button>
      </div>

      {errore && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          {errore}
        </p>
      )}
      {esito && (
        <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2">
          {esito}
        </p>
      )}

      {voci.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-600">
            Nessuna TL è contrassegnata come rilevante per il perimetro. La check non ha voci e non
            blocca il triage: il contrassegno si imposta in{' '}
            <b>Parametri di Spazio → Materie e lavorazioni</b>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {voci.map((v) => (
            <div
              key={v.lavorazioneId}
              className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-xs font-bold text-slate-900">{v.tipologia}</p>
                  <p className="text-[10px] text-slate-500">
                    {v.materia ? `Materia: ${v.materia}` : 'Materia non indicata'}
                    {v.dipendenza ? ` · Ufficio: ${v.dipendenza}` : ''}
                  </p>
                  {v.prodotti.length > 0 && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Prodotti che la richiamano: {v.prodotti.join(', ')}
                    </p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {v.codici.length > 0
                      ? `Codici coperti (${v.codici.length}): ${v.codici.join(', ')}`
                      : v.codiciDallaMateria
                        ? 'Nessun codice di partita cade in questa materia'
                        : 'Nessun codice: i prodotti collegati non corrispondono a una materia'}
                  </p>
                </div>
                {v.verso && (
                  <span
                    className={`text-[9px] font-bold uppercase rounded px-1.5 py-0.5 ${
                      v.verso === 'RESISTENZA'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {v.verso === 'RESISTENZA' ? 'Resistenza' : 'Collaborativa'}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Esito del riscontro
                  <select
                    value={v.stato ?? ''}
                    onChange={(e) =>
                      modifica(v.lavorazioneId, {
                        stato: (e.target.value || null) as StatoPerimetro | null,
                      })
                    }
                    className={`${CLASSE} mt-1`}
                  >
                    <option value="">Non risposto</option>
                    {(Object.keys(ETICHETTA_STATO) as StatoPerimetro[]).map((s) => (
                      <option key={s} value={s}>
                        {ETICHETTA_STATO[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Natura della problematica
                  <select
                    value={v.natura ?? ''}
                    disabled={v.stato !== 'NON_RISCONTRATA'}
                    onChange={(e) =>
                      modifica(v.lavorazioneId, {
                        natura: (e.target.value || null) as NaturaProblema | null,
                      })
                    }
                    className={`${CLASSE} mt-1 disabled:bg-slate-100 disabled:text-slate-400`}
                  >
                    <option value="">
                      {v.stato === 'NON_RISCONTRATA' ? 'Da indicare' : 'Non richiesta'}
                    </option>
                    {(Object.keys(ETICHETTA_NATURA) as NaturaProblema[]).map((n) => (
                      <option key={n} value={n}>
                        {ETICHETTA_NATURA[n]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Nota (facoltativa)
                  <input
                    type="text"
                    value={v.nota ?? ''}
                    maxLength={500}
                    onChange={(e) => modifica(v.lavorazioneId, { nota: e.target.value || null })}
                    placeholder="Es. tre solleciti senza risposta"
                    className={`${CLASSE} mt-1`}
                  />
                </label>
              </div>

              {v.stato === 'NON_RISCONTRATA' && (
                <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  {v.verso === 'RESISTENZA'
                    ? 'TL di resistenza non riscontrata: i codici restano da attenzionare finché la natura non è dichiarata.'
                    : 'Indica la natura: un problema momentaneo e un modus operandi portano a decisioni diverse.'}
                  {v.verso && ` ${ETICHETTA_VERSO[v.verso]}.`}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {mancanze.length > 0 && (
        <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-3.5 h-3.5" /> Il triage non è completo
          </p>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {mancanze.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
