import React from 'react';
import { Construction } from 'lucide-react';

interface Props {
  titolo: string;
  descrizione: string;
  puntiChiave: string[];
}

/** Placeholder onesto per una sezione del Pannello Spazio ancora da costruire: dice cosa conterrà, non finge sia già pronta. */
export function SezioneInCostruzione({ titolo, descrizione, puntiChiave }: Props) {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{titolo}</h1>
        <p className="text-slate-500 text-xs mt-1">{descrizione}</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-3">
        <Construction className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-amber-800 uppercase text-xs tracking-wider">
            Sezione non ancora costruita
          </div>
          <p className="text-xs text-amber-700 mt-1">
            Compare in navigazione perché fa parte del disegno complessivo, ma non contiene ancora
            funzionalità reali. Ecco cosa conterrà quando la costruiremo:
          </p>
          <ul className="text-xs text-amber-700 mt-3 space-y-1 list-disc list-inside">
            {puntiChiave.map((punto) => (
              <li key={punto}>{punto}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
