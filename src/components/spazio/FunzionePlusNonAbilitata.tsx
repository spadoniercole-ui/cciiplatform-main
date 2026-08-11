import React from 'react';
import { Sparkles } from 'lucide-react';

interface Props {
  nomeFunzione: string;
}

/** Mostrato al posto di una funzione plus non abilitata per questo spazio — non un errore, un invito a chiedere l'attivazione. */
export function FunzionePlusNonAbilitata({ nomeFunzione }: Props) {
  return (
    <div className="max-w-lg bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
      <div className="w-10 h-10 mx-auto rounded-full bg-blue-50 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-blue-600" />
      </div>
      <h2 className="font-bold text-slate-900 text-sm">
        {nomeFunzione} non è inclusa nella licenza di questo spazio
      </h2>
      <p className="text-[12px] text-slate-500">
        È una funzione plus, attivabile dal gestore della licenza — contattalo se ti serve per
        questo scenario.
      </p>
    </div>
  );
}
