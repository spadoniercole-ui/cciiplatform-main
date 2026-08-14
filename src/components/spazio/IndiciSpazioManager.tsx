'use client';

import React, { useEffect, useState } from 'react';
import { useDichiaraContestoAssistente } from '@/components/ContestoAssistenteContext';
import { TrendingUp } from 'lucide-react';
import {
  ottieniIndiciSpazio,
  impostaIndiceAbilitatoAction,
  type IndiceMaster,
} from '@/app/actions/parametriSpazio';

interface Props {
  nomeSchema: string;
}

export function IndiciSpazioManager({ nomeSchema }: Props) {
  useDichiaraContestoAssistente({ pagina: 'parametri', nomeSchema, sezioneParametri: 'Indici' });
  const [indici, setIndici] = useState<IndiceMaster[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = async () => {
    setCaricamento(true);
    const risultato = await ottieniIndiciSpazio(nomeSchema);
    if (!risultato.success) setErrore(risultato.error || 'Errore indici.');
    setIndici(risultato.indici);
    setCaricamento(false);
  };

  useEffect(() => {
    carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeSchema]);

  const handleToggleIndice = async (indice: IndiceMaster) => {
    const nuovoValore = !indice.abilitato;
    setIndici((prev) =>
      prev.map((i) => (i.id === indice.id ? { ...i, abilitato: nuovoValore } : i))
    );
    const risultato = await impostaIndiceAbilitatoAction(nomeSchema, indice.id, nuovoValore);
    if (!risultato.success) {
      setIndici((prev) =>
        prev.map((i) => (i.id === indice.id ? { ...i, abilitato: indice.abilitato } : i))
      );
      setErrore(risultato.error || "Impossibile salvare la modifica dell'indice.");
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const indiciPerCategoria = indici.reduce<Record<string, IndiceMaster[]>>((acc, i) => {
    (acc[i.categoria] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Indici da usare in questo spazio
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Questi sono i 9 indici che il motore XBRL calcola davvero da un bilancio caricato (5
        CNDCEC/CCII + 4 di lettura economico-finanziaria). Spenti qui, non compariranno più
        nell&apos;Import XBRL di nessuna azienda di questo spazio.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(indiciPerCategoria).map(([categoria, elenco]) => (
          <div key={categoria}>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">{categoria}</h3>
            <div className="space-y-1">
              {elenco.map((indice) => (
                <label
                  key={indice.id}
                  className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer py-1"
                >
                  <input
                    type="checkbox"
                    checked={indice.abilitato}
                    onChange={() => handleToggleIndice(indice)}
                  />
                  <span className={indice.abilitato ? '' : 'text-slate-400 line-through'}>
                    {indice.nome}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {indici.length === 0 && (
          <p className="text-xs text-slate-400">
            Nessun indice nel dizionario master (Dizionario Indici, lato superadmin).
          </p>
        )}
      </div>
    </div>
  );
}
