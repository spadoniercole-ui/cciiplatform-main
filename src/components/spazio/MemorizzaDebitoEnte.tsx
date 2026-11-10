'use client';

// MEMORIZZA IL DEBITO DALLA LISTA DELLA VERIFICA AZIENDA (0.198.0).
//
// La cifra si memorizza da sola quando la verifica amministrativa registra il
// proprio esito. Ma una verifica già chiusa prima di quel meccanismo — o
// riaperta senza rifare l'esito — lascia il badge «da memorizzare» e nessun
// modo di rimediare da qui. Questo è quel modo: rilegge gli archivi e scrive
// la cifra nella tabella che la verifica contabile e gli scenari leggono.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, Loader2 } from 'lucide-react';
import { aggiornaDebitoEnteMemorizzatoAction } from '@/app/actions/debitiEnteMemorizzati';

export function MemorizzaDebitoEnte({
  nomeSchema,
  aziendaId,
}: {
  nomeSchema: string;
  aziendaId: number;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const memorizza = async () => {
    setInCorso(true);
    setErrore(null);
    try {
      const r = await aggiornaDebitoEnteMemorizzatoAction(nomeSchema, aziendaId);
      if (!r.success) {
        setErrore(r.error ?? 'Memorizzazione non riuscita.');
        return;
      }
      router.refresh();
    } catch (error) {
      setErrore((error as Error).message);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={memorizza}
        disabled={inCorso}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-900 hover:bg-amber-100 disabled:opacity-50"
      >
        {inCorso ? <Loader2 className="h-3 w-3 animate-spin" /> : <HandCoins className="h-3 w-3" />}
        {inCorso ? 'Memorizzo…' : 'Memorizza debito'}
      </button>
      {errore && (
        <p className="max-w-[220px] text-right text-[10px] leading-snug text-red-700">{errore}</p>
      )}
    </div>
  );
}
