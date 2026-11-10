'use client';

// IL DEBITO MEMORIZZATO DALLA VERIFICA AMMINISTRATIVA — scheda di sola lettura.
//
// A verifica amministrativa chiusa la cifra è un atto, non un calcolo a
// schermo: qui si vede che cosa è stato consegnato, con i tre stati separati,
// la fonte e la data. Il rinnovo è esplicito perché rileggere gli archivi è
// una scelta dell'operatore, non un effetto collaterale dell'aver aperto una
// pagina.

import { useCallback, useEffect, useState } from 'react';
import { HandCoins, Loader2, RefreshCw } from 'lucide-react';
import {
  aggiornaDebitoEnteMemorizzatoAction,
  debitoEnteMemorizzatoAction,
} from '@/app/actions/debitiEnteMemorizzati';
import type { DebitoMemorizzato } from '@/lib/debitiEnte/memorizzazione';

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;

export function DebitoMemorizzatoEnte({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const [debito, setDebito] = useState<DebitoMemorizzato | null>(null);
  const [memorizzatoIl, setMemorizzatoIl] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [letto, setLetto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    const r = await debitoEnteMemorizzatoAction(nomeSchema, aziendaId);
    if (r.debito) {
      setDebito(r.debito);
      setMemorizzatoIl(r.memorizzatoIl ?? null);
    }
    setLetto(true);
  }, [nomeSchema, aziendaId]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const rinnova = async () => {
    setInCorso(true);
    setErrore(null);
    const r = await aggiornaDebitoEnteMemorizzatoAction(nomeSchema, aziendaId);
    setInCorso(false);
    if (!r.success || !r.debito) {
      setErrore(r.error ?? 'Aggiornamento non riuscito.');
      return;
    }
    setDebito(r.debito);
    setMemorizzatoIl(r.memorizzatoIl ?? null);
  };

  if (!letto) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <HandCoins className="w-3.5 h-3.5 text-blue-600" />
          Debito consegnato alla verifica contabile
        </h3>
        <button
          type="button"
          onClick={rinnova}
          disabled={inCorso}
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-800 disabled:opacity-50"
        >
          {inCorso ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          Rinnova dagli archivi
        </button>
      </div>

      {errore && <p className="text-[11px] text-red-700">{errore}</p>}

      {!debito ? (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Nessun debito memorizzato: la verifica amministrativa non è ancora stata chiusa, oppure
          gli archivi dell’ente non portano posizioni per questa azienda. La verifica contabile non
          ne ha bisogno; la verifica azienda sì, e leggerà la cifra da qui quando ci sarà.
        </p>
      ) : (
        <>
          <p className="text-lg font-bold text-slate-900 tabular-nums">{euro(debito.totale)}</p>
          <div className="text-[11px] text-slate-600 space-y-0.5">
            {debito.ripartito ? (
              <>
                <p>
                  Contabilizzato <strong>{euro(debito.contabilizzato)}</strong> · da contabilizzare{' '}
                  <strong>{euro(debito.daContabilizzare)}</strong>
                </p>
                {debito.segnalato > 0 && (
                  <p className="text-slate-500">
                    {euro(debito.segnalato)} segnalati alle unità operative, fuori dal totale.
                  </p>
                )}
              </>
            ) : (
              <p>
                Il dato non distingue contabilizzato e da contabilizzare: la cifra è dichiarata, la
                ripartizione no.
              </p>
            )}
            <p className="text-slate-500">{debito.fonte}</p>
            <p className="text-slate-400">
              Memorizzato {memorizzatoIl ? `il ${memorizzatoIl}` : 'in data non registrata'} ·{' '}
              {debito.righe} posizioni
            </p>
          </div>
        </>
      )}
    </div>
  );
}
