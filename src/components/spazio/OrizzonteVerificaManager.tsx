'use client';

// ORIZZONTE DI PROIEZIONE — il predefinito dello spazio (0.205.0).
//
// L'orizzonte non è un dettaglio di visualizzazione: cambiarlo cambia le
// valutazioni già fatte. Per questo vive qui, fra i parametri, e non dentro la
// scheda di una singola azienda: qui è il valore che vale per tutte. La
// singola azienda può avere il suo, e si imposta nella sua verifica contabile;
// le simulazioni già salvate restano con l'orizzonte con cui sono nate.

import { useEffect, useState } from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';
import {
  impostaConfigVerificaAziendaAction,
  ottieniConfigVerificaAziendaAction,
} from '@/app/actions/verificaAzienda';
import { ANNUALITA_MASSIME, ANNUALITA_MINIME } from '@/lib/verificaAzienda/simulazione';

export function OrizzonteVerificaManager({ nomeSchema }: { nomeSchema: string }) {
  const [annualita, setAnnualita] = useState(3);
  const [salvata, setSalvata] = useState(3);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await ottieniConfigVerificaAziendaAction(nomeSchema);
      if (r.success) {
        setAnnualita(r.annualita);
        setSalvata(r.annualita);
      } else {
        setErrore(r.error ?? 'Impossibile leggere l’orizzonte.');
      }
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const salva = async () => {
    setSalvataggio(true);
    setErrore(null);
    setMessaggio(null);
    const r = await impostaConfigVerificaAziendaAction(nomeSchema, annualita);
    setSalvataggio(false);
    if (!r.success) {
      setErrore(r.error ?? 'Orizzonte non salvato.');
      return;
    }
    setSalvata(r.annualita);
    setAnnualita(r.annualita);
    setMessaggio(`Predefinito dello spazio: ${r.annualita} annualità di proiezione.`);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento…</p>;

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
        <CalendarRange className="w-4 h-4 text-blue-600" />
        Orizzonte di proiezione
      </h2>
      <p className="text-[11px] text-slate-500 leading-relaxed max-w-2xl">
        Quante annualità proietta la simulazione della verifica azienda. Questo è il predefinito
        dello <strong>spazio</strong>: vale per ogni azienda che non abbia un proprio orizzonte, che
        si imposta nella sua verifica contabile. Le simulazioni già salvate restano con l’orizzonte
        con cui sono state calcolate: cambiarne una non riscrive il passato.
      </p>

      {errore && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </p>
      )}
      {messaggio && (
        <p className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          {messaggio}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] text-slate-600">
          Annualità proiettate
          <input
            type="number"
            min={ANNUALITA_MINIME}
            max={ANNUALITA_MASSIME}
            value={annualita}
            onChange={(e) => setAnnualita(Number(e.target.value))}
            className="mt-0.5 block w-24 rounded border border-slate-300 px-2 py-1 text-xs"
          />
        </label>
        <button
          type="button"
          onClick={() => void salva()}
          disabled={salvataggio || annualita === salvata}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {salvataggio && <Loader2 className="w-3 h-3 animate-spin" />}
          Salva il predefinito
        </button>
        <span className="text-[10px] text-slate-400">
          Fra {ANNUALITA_MINIME} e {ANNUALITA_MASSIME} annualità.
        </span>
      </div>
    </div>
  );
}
