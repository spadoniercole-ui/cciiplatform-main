'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Save, Plus, X } from 'lucide-react';
import {
  ottieniDirettriciEnte,
  aggiornaDirettriciEnteAction,
  type DirettriceStrutturata,
} from '@/app/actions/screeningAzienda';

interface Props {
  nomeSchema: string;
}

const DIRETTRICE_VUOTA: DirettriceStrutturata = { nome: '', prodotti: [] };

export function DirettriciEnteConfigManager({ nomeSchema }: Props) {
  const [direttrici, setDirettrici] = useState<DirettriceStrutturata[]>([]);
  const [nuovoProdotto, setNuovoProdotto] = useState<Record<number, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCaricamento(true);
      const risultato = await ottieniDirettriciEnte(nomeSchema);
      if (risultato.success) setDirettrici(risultato.direttrici);
      else setErrore(risultato.error || 'Impossibile caricare.');
      setCaricamento(false);
    })();
  }, [nomeSchema]);

  const handleSalva = async () => {
    setSalvataggio(true);
    setSalvato(false);
    setErrore(null);
    const risultato = await aggiornaDirettriciEnteAction(nomeSchema, direttrici);
    if (risultato.success) setSalvato(true);
    else setErrore(risultato.error || 'Impossibile salvare.');
    setSalvataggio(false);
  };

  const aggiungiDirettrice = () => setDirettrici([...direttrici, { ...DIRETTRICE_VUOTA }]);

  const rimuoviDirettrice = (indice: number) =>
    setDirettrici(direttrici.filter((_, i) => i !== indice));

  const rinominaDirettrice = (indice: number, nome: string) => {
    const nuove = [...direttrici];
    nuove[indice] = { ...nuove[indice], nome };
    setDirettrici(nuove);
  };

  const aggiungiProdotto = (indice: number) => {
    const prodotto = (nuovoProdotto[indice] || '').trim();
    if (!prodotto) return;
    const nuove = [...direttrici];
    nuove[indice] = { ...nuove[indice], prodotti: [...nuove[indice].prodotti, prodotto] };
    setDirettrici(nuove);
    setNuovoProdotto({ ...nuovoProdotto, [indice]: '' });
  };

  const rimuoviProdotto = (indiceDirettrice: number, indiceProdotto: number) => {
    const nuove = [...direttrici];
    nuove[indiceDirettrice] = {
      ...nuove[indiceDirettrice],
      prodotti: nuove[indiceDirettrice].prodotti.filter((_, i) => i !== indiceProdotto),
    };
    setDirettrici(nuove);
  };

  if (caricamento) return <p className="text-xs text-slate-400">Caricamento...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <h2 className="font-bold text-slate-900 uppercase text-xs tracking-wider">
          Direttrici Ente — Screening
        </h2>
      </div>
      <p className="text-[11px] text-slate-500">
        Le aree lungo cui l&apos;AI genera il questionario di screening per ogni azienda di questo
        spazio — una sezione di domande per ciascuna direttrice. Per ogni direttrice, elenca i
        prodotti o le procedure concreti (es. Cassa Integrazione, DURC, DICA): l&apos;AI genera
        domande ancorate a questi, non alla direttrice in astratto — è quello che tiene le domande
        pertinenti invece di generiche.
      </p>

      {errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
      {salvato && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          Direttrici aggiornate.
        </div>
      )}

      <div className="space-y-3">
        {direttrici.map((d, indice) => (
          <div key={indice} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={d.nome}
                onChange={(e) => rinominaDirettrice(indice, e.target.value)}
                placeholder="Nome direttrice — es. Vigilanza documentale"
                className="flex-1 p-2 text-xs font-bold border border-slate-200 rounded-lg text-slate-900 bg-white"
              />
              <button
                type="button"
                onClick={() => rimuoviDirettrice(indice)}
                className="text-slate-400 hover:text-red-600 shrink-0"
                title="Rimuovi direttrice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {d.prodotti.map((prodotto, indiceProdotto) => (
                <span
                  key={indiceProdotto}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-md"
                >
                  {prodotto}
                  <button
                    type="button"
                    onClick={() => rimuoviProdotto(indice, indiceProdotto)}
                    className="hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nuovoProdotto[indice] || ''}
                onChange={(e) => setNuovoProdotto({ ...nuovoProdotto, [indice]: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    aggiungiProdotto(indice);
                  }
                }}
                placeholder="Aggiungi prodotto — es. Cassa Integrazione, DURC, DICA..."
                className="flex-1 p-2 text-xs border border-slate-200 rounded-lg text-slate-900 bg-white"
              />
              <button
                type="button"
                onClick={() => aggiungiProdotto(indice)}
                className="flex items-center gap-1 px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase rounded-lg transition-colors shrink-0"
              >
                <Plus className="w-3 h-3" /> Aggiungi
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={aggiungiDirettrice}
          className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-500 hover:text-blue-700 font-bold text-xs uppercase rounded-lg transition-colors w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" /> Aggiungi direttrice
        </button>

        <button
          type="button"
          onClick={handleSalva}
          disabled={salvataggio}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold uppercase tracking-wider rounded-lg text-xs transition-colors"
        >
          <Save className="w-3.5 h-3.5" /> {salvataggio ? 'Salvataggio...' : 'Salva'}
        </button>
      </div>
    </div>
  );
}
