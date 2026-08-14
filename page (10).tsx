'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { IndiceXbrl } from '@/types/indici';

export function ModuloIndici() {
  const [mounted, setMounted] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('ALL');
  const [indici, setIndici] = useState<IndiceXbrl[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const caricaIndici = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/indici');
      if (!res.ok) throw new Error('Errore nella chiamata API');
      const dati = await res.json();
      setIndici(Array.isArray(dati) ? dati : []);
    } catch (error) {
      console.error(error);
      toast.error('Errore nel caricamento del database degli indici.');
      setIndici([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      caricaIndici();
    }
  }, [mounted, caricaIndici]);

  const handleLocalUpdate = (id: string, field: keyof IndiceXbrl, value: any) => {
    setIndici((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handlePersistUpdate = async (
    id: string,
    field: 'nome' | 'formula' | 'xbrlTag',
    value: string
  ) => {
    setSyncing(id);
    try {
      const res = await fetch('/api/indici', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, campo: field, valore: value }),
      });

      if (res.ok) {
        toast.success(`Indice ${id} sincronizzato.`, { duration: 1500 });
      } else {
        toast.error('Impossibile salvare nel database.');
        await caricaIndici();
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore durante il salvataggio.');
      await caricaIndici();
    } finally {
      setSyncing(null);
    }
  };

  const handleAddIndice = async () => {
    const nuovoIndice: IndiceXbrl = {
      id: `IND-${Date.now().toString().slice(-4)}`,
      categoria: 'CCII',
      nome: 'Nuovo Indice Personalizzato',
      formula: 'Formula Matematica Lineare',
      xbrlTag: 'it-cc-custom_tag',
      attivo: true,
    };

    setLoading(true);
    try {
      const res = await fetch('/api/indici', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuovoIndice),
      });

      if (res.ok) {
        toast.success('Indice aggiunto.');
        await caricaIndici();
      } else {
        toast.error("Errore nell'aggiunta.");
      }
    } catch (error) {
      console.error(error);
      toast.error('Errore di comunicazione.');
    } finally {
      setLoading(false);
    }
  };

  const esportaDizionarioCSV = () => {
    if (!Array.isArray(indici) || indici.length === 0) return;

    const headers = ['ID', 'Categoria', 'Nome Indice', 'Formula', 'Tag XBRL Mappato'];
    const rows = indici.map((i) => [i.id, i.categoria, i.nome, i.formula, i.xbrlTag]);

    const csvContent = [headers, ...rows]
      .map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dizionario_indici_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!mounted) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
        <svg className="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span className="ml-3 text-sm font-mono text-gray-600">
          Inizializzazione interfaccia...
        </span>
      </div>
    );
  }

  const listaIndiciSicura = Array.isArray(indici) ? indici : [];
  const indiciFiltrati =
    filtroCategoria === 'ALL'
      ? listaIndiciSicura
      : listaIndiciSicura.filter((i) => i.categoria === filtroCategoria);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-gray-100 pb-4">
        <div className="flex items-start space-x-3">
          {/* SVG Database */}
          <svg
            className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
            <path d="M3 12A9 3 0 0 0 21 12"></path>
          </svg>
          <div>
            <h3 className="text-sm font-black text-gray-900 uppercase font-mono tracking-tight">
              Dizionario Indici Tassonomia XBRL
            </h3>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">
              Definizione formule matematiche sincronizzate su PostgreSQL.
            </p>
          </div>
        </div>

        <div className="flex gap-2 items-center self-end md:self-auto">
          <div className="flex items-center space-x-1 bg-gray-50 border border-gray-200 rounded-xl px-2">
            {/* SVG Filter */}
            <svg
              className="h-3 w-3 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="py-2 bg-transparent text-[11px] font-mono font-bold text-gray-600 outline-none focus:ring-0 cursor-pointer"
            >
              <option value="ALL">TUTTE LE CATEGORIE</option>
              <option value="REDDITIVITÀ">REDDITIVITÀ</option>
              <option value="LIQUIDITÀ">LIQUIDITÀ E SOLVIBILITÀ</option>
              <option value="SOLIDITÀ">SOLIDITÀ PATRIMONIALE</option>
              <option value="ROTAZIONE">ROTAZIONE E DURATA</option>
              <option value="CCII">INDICI SPECIFICI CCII</option>
              <option value="BENCHMARK">INDICI DI BENCHMARK (ISTAT)</option>
            </select>
          </div>

          <button
            onClick={handleAddIndice}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 text-white font-bold text-[10px] font-mono rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap shadow-sm"
          >
            {/* SVG Plus */}
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>AGGIUNGI INDICE</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={esportaDizionarioCSV}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-bold border border-gray-700 flex items-center gap-1.5 transition-all shadow-sm font-mono"
        >
          {/* SVG Export File */}
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>Esporta CSV</span>
        </button>

        {syncing && (
          <div className="flex items-center space-x-2 text-xs font-mono text-blue-600 animate-pulse">
            <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Sincronizzazione DB...</span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto max-h-[650px] overflow-y-auto border border-gray-100 rounded-xl">
        <table className="w-full text-xs font-mono table-fixed min-w-[850px]">
          <thead className="text-gray-500 uppercase sticky top-0 bg-gray-50 border-b border-gray-200 shadow-sm z-10 text-[10px]">
            <tr>
              <th className="p-3 text-left w-1/4 tracking-wider">Nome Indice / Categoria</th>
              <th className="p-3 text-left w-1/3 tracking-wider">Formula di Calcolo</th>
              <th className="p-3 text-left w-1/3 tracking-wider">Tag Tassonomia XBRL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {indiciFiltrati.map((ind) => (
              <tr key={ind.id} className="hover:bg-gray-50/40 transition-colors">
                <td className="p-2.5 align-top">
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900 outline-none focus:bg-white focus:border-blue-500 transition-all text-xs"
                      value={ind.nome}
                      onChange={(e) => handleLocalUpdate(ind.id, 'nome', e.target.value)}
                      onBlur={(e) => handlePersistUpdate(ind.id, 'nome', e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <span className="inline-block text-[9px] px-2 py-0.5 bg-gray-100 text-gray-500 font-bold rounded uppercase tracking-wider">
                        {ind.categoria}
                      </span>
                      <span className="text-[9px] font-mono text-gray-400">
                        ID: <code className="text-red-500 font-bold">{ind.id}</code>
                      </span>
                    </div>
                  </div>
                </td>

                <td className="p-2.5 align-top">
                  <textarea
                    rows={2}
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 resize-none font-sans text-xs outline-none focus:bg-white focus:border-blue-500 transition-all"
                    value={ind.formula}
                    onChange={(e) => handleLocalUpdate(ind.id, 'formula', e.target.value)}
                    onBlur={(e) => handlePersistUpdate(ind.id, 'formula', e.target.value)}
                  />
                </td>

                <td className="p-2.5 align-top">
                  <textarea
                    rows={2}
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-[11px] text-blue-600 font-bold resize-none outline-none focus:bg-white focus:border-blue-500 transition-all"
                    value={ind.xbrlTag}
                    onChange={(e) => handleLocalUpdate(ind.id, 'xbrlTag', e.target.value)}
                    onBlur={(e) => handlePersistUpdate(ind.id, 'xbrlTag', e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Esporta sia come Default che come Named per evitare QUALSIASI errore di importazione
export default ModuloIndici;
