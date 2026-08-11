'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

import { getFinancialData } from '@/lib/financialEngine';

// Definiamo i tipi (opzionale ma consigliato per pulizia)
// Assumendo che questi siano i tipi restituiti da getFinancialData
interface StatsTypeA {
  valoreAggiunto: { MOL: number };
  statoPatrimoniale: any;
}
interface StatsTypeB {
  mol: number;
  roe: number;
}

export default function XBRLViewer({ aziendaCodiceFiscale }: { aziendaCodiceFiscale: string }) {
  const [datiEstratti, setDatiEstratti] = useState<Record<string, number>>({});
  const [anno, setAnno] = useState<'c0' | 'c1'>('c0');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const xmlDoc = new DOMParser().parseFromString(event.target?.result as string, 'text/xml');
      const nuoviDati: Record<string, number> = {};
      const nodes = xmlDoc.getElementsByTagName('*');
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const val = parseFloat(n.textContent || '');
        const ctx = n.getAttribute('contextRef');
        if (!isNaN(val) && ctx) nuoviDati[`${n.tagName}:${ctx}`] = val;
      }
      setDatiEstratti(nuoviDati);
    };
    reader.readAsText(file);
  };

  const hasData = Object.keys(datiEstratti).length > 0;
  // Recuperiamo i dati grezzi
  const stats = hasData ? getFinancialData(datiEstratti, anno) : { mol: 0, roe: 0 };

  // ESTRAZIONE SICURA: Usiamo Type Guards per evitare che TS si lamenti
  const getMOL = () => {
    if ('mol' in stats) return (stats as StatsTypeB).mol;
    return (stats as StatsTypeA).valoreAggiunto?.MOL || 0;
  };

  const getROE = () => {
    if ('roe' in stats) return (stats as StatsTypeB).roe;
    return 0;
  };

  return (
    <div className="p-8 bg-slate-950 text-slate-200 rounded-2xl border border-slate-800 shadow-2xl max-w-7xl mx-auto my-10 font-sans">
      <h1 className="text-xl font-bold mb-4">Pipeline XBRL: {aziendaCodiceFiscale}</h1>
      <input
        type="file"
        onChange={handleFileUpload}
        className="mb-6 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:bg-emerald-600 file:text-white rounded-full cursor-pointer"
      />

      <select
        value={anno}
        onChange={(e) => setAnno(e.target.value as any)}
        className="bg-slate-900 p-2 mb-6 border border-slate-700 rounded text-sm"
      >
        <option value="c0">Anno Corrente</option>
        <option value="c1">Anno Precedente</option>
      </select>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-6 border border-slate-700 rounded bg-slate-900">
          <p className="text-[10px] text-slate-400 uppercase">MOL</p>
          {/* 🟢 Sostituisci con questo: */}
          <p className="text-2xl font-mono">{(getMOL() ?? 0).toLocaleString()}</p>
        </div>
        <div className="p-6 border border-slate-700 rounded bg-slate-900">
          <p className="text-[10px] text-slate-400 uppercase">ROE</p>
          <p className="text-2xl font-mono">{getROE().toFixed(2)}%</p>
        </div>
      </div>
    </div>
  );
}
