'use client';

// MODELLO DI PROIEZIONE — le tre ipotesi dichiarate della simulazione (0.208.0).
//
// L'orizzonte dice quante annualità si proiettano; il decadimento dice con
// quale velocità la crescita storica si avvicina a quella di settore; le rate
// di rientro dicono in quante quote si estingue il debito dell'ente entrato nel
// passivo. Sono scelte dell'ente, non leggi: per questo stanno qui, fra i
// parametri, e non nascoste nel calcolo. I valori predefiniti restano quelli
// del motore e sono dichiarati accanto ai campi.

import { useEffect, useState } from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';
import {
  impostaConfigVerificaAziendaAction,
  impostaModelloProiezioneAction,
  ottieniConfigVerificaAziendaAction,
  ottieniModelloProiezioneAction,
} from '@/app/actions/verificaAzienda';
import {
  ANNI_RIENTRO_MASSIMI,
  ANNI_RIENTRO_MINIMI,
  ANNUALITA_MASSIME,
  ANNUALITA_MINIME,
  DECADIMENTO_MASSIMO,
  DECADIMENTO_MINIMO,
} from '@/lib/verificaAzienda/simulazione';

export function ModelloProiezioneManager({ nomeSchema }: { nomeSchema: string }) {
  const [annualita, setAnnualita] = useState(3);
  const [annualitaSalvata, setAnnualitaSalvata] = useState(3);
  const [decadimentoPct, setDecadimentoPct] = useState(60);
  const [decadimentoSalvato, setDecadimentoSalvato] = useState(60);
  const [anniRientro, setAnniRientro] = useState(3);
  const [anniRientroSalvati, setAnniRientroSalvati] = useState(3);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [config, modello] = await Promise.all([
        ottieniConfigVerificaAziendaAction(nomeSchema),
        ottieniModelloProiezioneAction(nomeSchema),
      ]);
      if (config.success) {
        setAnnualita(config.annualita);
        setAnnualitaSalvata(config.annualita);
      } else {
        setErrore(config.error ?? 'Impossibile leggere l’orizzonte.');
      }
      if (modello.success) {
        const pct = Math.round(modello.decadimentoCrescita * 100);
        setDecadimentoPct(pct);
        setDecadimentoSalvato(pct);
        setAnniRientro(modello.anniRientroDebito);
        setAnniRientroSalvati(modello.anniRientroDebito);
      }
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const modificato =
    annualita !== annualitaSalvata ||
    decadimentoPct !== decadimentoSalvato ||
    anniRientro !== anniRientroSalvati;

  const salva = async () => {
    setSalvataggio(true);
    setErrore(null);
    setMessaggio(null);

    const orizzonte = await impostaConfigVerificaAziendaAction(nomeSchema, annualita);
    if (!orizzonte.success) {
      setSalvataggio(false);
      setErrore(orizzonte.error ?? 'Orizzonte non salvato.');
      return;
    }
    const modello = await impostaModelloProiezioneAction(
      nomeSchema,
      decadimentoPct / 100,
      anniRientro
    );
    setSalvataggio(false);
    if (!modello.success) {
      setErrore(modello.error ?? 'Modello non salvato.');
      return;
    }
    setAnnualitaSalvata(orizzonte.annualita);
    setAnnualita(orizzonte.annualita);
    const pct = Math.round(modello.decadimentoCrescita * 100);
    setDecadimentoPct(pct);
    setDecadimentoSalvato(pct);
    setAnniRientro(modello.anniRientroDebito);
    setAnniRientroSalvati(modello.anniRientroDebito);
    setMessaggio(
      `Modello salvato: ${orizzonte.annualita} annualità, convergenza al settore al ${pct}% ogni anno, debito dell’ente in ${modello.anniRientroDebito} rate.`
    );
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento…</p>;

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
        <CalendarRange className="w-4 h-4 text-blue-600" />
        Modello di proiezione
      </h2>
      <p className="text-[11px] text-slate-500 leading-relaxed max-w-2xl">
        Le ipotesi con cui la verifica azienda proietta il dato depositato. Sono{' '}
        <strong>scelte dichiarate</strong>, non regole di legge: la traiettoria parte dalla crescita
        storica dei ricavi e si avvicina a quella di settore, e il debito dell’ente si estingue a
        rate. Le simulazioni già salvate restano con le ipotesi con cui sono nate: cambiarle non
        riscrive il passato.
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

      <div className="grid sm:grid-cols-3 gap-3">
        <label className="text-[10px] text-slate-600">
          Annualità proiettate
          <input
            type="number"
            min={ANNUALITA_MINIME}
            max={ANNUALITA_MASSIME}
            value={annualita}
            onChange={(e) => setAnnualita(Number(e.target.value))}
            className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <span className="block mt-1 text-[9px] text-slate-400">
            Fra {ANNUALITA_MINIME} e {ANNUALITA_MASSIME}. Una singola azienda può avere il suo,
            nella sua verifica contabile.
          </span>
        </label>

        <label className="text-[10px] text-slate-600">
          Decadimento della crescita (%)
          <input
            type="number"
            min={DECADIMENTO_MINIMO * 100}
            max={DECADIMENTO_MASSIMO * 100}
            step={5}
            value={decadimentoPct}
            onChange={(e) => setDecadimentoPct(Number(e.target.value))}
            className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <span className="block mt-1 text-[9px] text-slate-400">
            Quanto resta ogni anno dello scostamento dal settore. 0% = converge subito; 90% = resta
            a lungo vicina al passato.
          </span>
        </label>

        <label className="text-[10px] text-slate-600">
          Rate di rientro del debito ente
          <input
            type="number"
            min={ANNI_RIENTRO_MINIMI}
            max={ANNI_RIENTRO_MASSIMI}
            value={anniRientro}
            onChange={(e) => setAnniRientro(Number(e.target.value))}
            className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-xs"
          />
          <span className="block mt-1 text-[9px] text-slate-400">
            In quante quote costanti si estingue il debito iscritto nella prima annualità (fra{' '}
            {ANNI_RIENTRO_MINIMI} e {ANNI_RIENTRO_MASSIMI}).
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void salva()}
          disabled={salvataggio || !modificato}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {salvataggio && <Loader2 className="w-3 h-3 animate-spin" />}
          Salva il modello
        </button>
        <span className="text-[10px] text-slate-400">
          Predefiniti del motore: 3 annualità · 60% · 3 rate.
        </span>
      </div>
    </div>
  );
}
