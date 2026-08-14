'use client';

// Indici per una specifica azienda: quali indici (tra quelli già attivi
// per l'intero spazio) si applicano a questa azienda. Utile quando nello
// stesso spazio (es. lo studio di un commercialista) gravitano aziende di
// settori ATECO diversi, per cui non tutti gli indici hanno senso per
// tutte le aziende.

import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  ottieniIndiciAzienda,
  impostaIndiceAziendaAction,
  type IndiceAzienda,
} from '@/app/actions/aziendaConfig';

interface Props {
  nomeSchema: string;
  aziendaId: number;
}

export function AziendaConfigIndici({ nomeSchema, aziendaId }: Props) {
  const [indici, setIndici] = useState<IndiceAzienda[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreSalvataggio, setErroreSalvataggio] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniIndiciAzienda(nomeSchema, aziendaId);
      if (risultato.success) setIndici(risultato.indici);
      else setErrore(risultato.error || 'Impossibile caricare gli indici.');
      setCaricamento(false);
    })();
  }, [nomeSchema, aziendaId]);

  const handleToggle = async (indice: IndiceAzienda) => {
    setErroreSalvataggio(null);
    const nuovoValore = !indice.abilitato;
    setIndici((prev) =>
      prev.map((i) => (i.id === indice.id ? { ...i, abilitato: nuovoValore } : i))
    );

    const risultato = await impostaIndiceAziendaAction(
      nomeSchema,
      aziendaId,
      indice.id,
      nuovoValore
    );
    if (!risultato.success) {
      // Il salvataggio è fallito davvero: annulla il toggle ottimistico e
      // mostra il perché, invece di lasciare che sparisca in silenzio al
      // prossimo caricamento della pagina.
      setIndici((prev) =>
        prev.map((i) => (i.id === indice.id ? { ...i, abilitato: indice.abilitato } : i))
      );
      setErroreSalvataggio(risultato.error || "Impossibile salvare la modifica dell'indice.");
    }
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  const indiciPerCategoria = indici.reduce<Record<string, IndiceAzienda[]>>((acc, i) => {
    (acc[i.categoria] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <TrendingUp className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Indici per questa azienda
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Questi sono i 9 indici che il motore XBRL calcola davvero da un bilancio caricato (5
        CNDCEC/CCII + 4 di lettura economico-finanziaria). L&apos;elenco mostra solo quelli già
        attivi per l&apos;intero spazio (Parametri di Spazio). Spegnili qui se non sono rilevanti
        per il settore o le caratteristiche di questa azienda.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {erroreSalvataggio && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {erroreSalvataggio}
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
                    onChange={() => handleToggle(indice)}
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
            Nessun indice attivo per questo spazio — configurali prima in Parametri di Spazio.
          </p>
        )}
      </div>
    </div>
  );
}
