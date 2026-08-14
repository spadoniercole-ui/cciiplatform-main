'use client';

// Il peso di ciascuna direttrice non si inserisce a mano — si calcola
// dal numero di prodotti configurati (Parametri di Spazio → Direttrici
// Ente): ogni prodotto vale 100/totale punti, il peso della direttrice
// è i suoi prodotti moltiplicati per quel valore. Questa pagina mostra
// il calcolo così com'è oggi, in trasparenza — nessun campo da
// modificare qui, si cambia aggiungendo o togliendo prodotti dalle
// direttrici stesse.

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ottieniDirettriciEnte } from '@/app/actions/screeningAzienda';
import { calcolaPesiDirettrici } from '@/lib/checklist/scoringDirettrici';

interface Props {
  nomeSchema: string;
}

export function PesiDirettriciInfo({ nomeSchema }: Props) {
  const [pesi, setPesi] = useState<{ nome: string; prodotti: number; peso: number }[]>([]);
  const [caricamento, setCaricamento] = useState(true);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniDirettriciEnte(nomeSchema);
      if (risultato.success) {
        const { pesiPerDirettrice } = calcolaPesiDirettrici(
          risultato.direttrici.map((d) => ({ numero: '', titolo: d.nome, domande: [] })),
          risultato.direttrici
        );
        setPesi(pesiPerDirettrice);
      }
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  if (pesi.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        Nessuna direttrice configurata ancora — vai su Direttrici Ente per aggiungerne.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Peso della Check List — direttrice per direttrice
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Calcolato dai prodotti configurati in Direttrici Ente, non inserito a mano: ogni prodotto
        vale lo stesso, il peso della direttrice è quanti prodotti ha. Il peso di ogni singola
        domanda (diviso ulteriormente per quante ne genera lo Screening) si vede dentro la Check
        List di ogni azienda.
      </p>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-slate-500 font-bold border-b border-slate-100">
              <th className="p-3">Direttrice</th>
              <th className="p-3">Prodotti</th>
              <th className="p-3">Peso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pesi.map((p) => (
              <tr key={p.nome}>
                <td className="p-3 font-bold text-slate-900">{p.nome}</td>
                <td className="p-3 text-slate-700">{p.prodotti}</td>
                <td className="p-3 font-bold text-slate-900">{p.peso.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
