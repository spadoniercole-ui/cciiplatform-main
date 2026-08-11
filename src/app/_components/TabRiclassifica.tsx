'use client';

import { useState, useMemo } from 'react';

// --- TIPI E INTERFACCE ---
type SchemaRiclassifica = 'CE_VALORE_AGGIUNTO' | 'SP_FINANZIARIO';
type FiltroConti = 'TUTTI' | 'DA_MAPPARE' | 'MAPPATI';

interface VoceContabileOrigine {
  id: string;
  codiceXbrl: string;
  descrizione: string;
  saldoOrigine: number;
  categoriaDestinazione: string;
  natura: 'A' | 'P' | 'C' | 'R';
}

interface NodoSchemaDestinazione {
  codice: string;
  titolo: string;
  tipo: 'SOMMA_NODI' | 'FOGLIA_MAPPABILE' | 'MARGINE_CALCOLATO';
}

// --- COSTANTI SCHEMA ---
const SCHEMA_CE: Record<string, NodoSchemaDestinazione> = {
  CE_RICAVI: { codice: 'CE_RICAVI', titolo: 'Ricavi delle Vendite', tipo: 'FOGLIA_MAPPABILE' },
  CE_VAR_RIM: { codice: 'CE_VAR_RIM', titolo: 'Var. Rimanenze', tipo: 'FOGLIA_MAPPABILE' },
  CE_ALTRI_RIC: { codice: 'CE_ALTRI_RIC', titolo: 'Altri Ricavi', tipo: 'FOGLIA_MAPPABILE' },
  CE_MAT_PRIME: { codice: 'CE_MAT_PRIME', titolo: 'Materie Prime', tipo: 'FOGLIA_MAPPABILE' },
  CE_SERVIZI: { codice: 'CE_SERVIZI', titolo: 'Servizi', tipo: 'FOGLIA_MAPPABILE' },
  CE_ALTRI_ONERI: { codice: 'CE_ALTRI_ONERI', titolo: 'Oneri Diversi', tipo: 'FOGLIA_MAPPABILE' },
  CE_PERSONALE: { codice: 'CE_PERSONALE', titolo: 'Personale', tipo: 'FOGLIA_MAPPABILE' },
  CE_AMM_SVAL: { codice: 'CE_AMM_SVAL', titolo: 'Ammortamenti', tipo: 'FOGLIA_MAPPABILE' },
  CE_PROV_FIN: { codice: 'CE_PROV_FIN', titolo: 'Proventi Finanziari', tipo: 'FOGLIA_MAPPABILE' },
  CE_ONERI_FIN: { codice: 'CE_ONERI_FIN', titolo: 'Oneri Finanziari', tipo: 'FOGLIA_MAPPABILE' },
  CE_IMPOSTE: { codice: 'CE_IMPOSTE', titolo: 'Imposte', tipo: 'FOGLIA_MAPPABILE' },
};

const SCHEMA_SP: Record<string, NodoSchemaDestinazione> = {
  SP_LIQ_IMM: { codice: 'SP_LIQ_IMM', titolo: 'Liquidità Immediate', tipo: 'FOGLIA_MAPPABILE' },
  SP_LIQ_DIF: { codice: 'SP_LIQ_DIF', titolo: 'Liquidità Differite', tipo: 'FOGLIA_MAPPABILE' },
  SP_RIMANENZE: { codice: 'SP_RIMANENZE', titolo: 'Rimanenze', tipo: 'FOGLIA_MAPPABILE' },
  SP_IMM_MAT: { codice: 'SP_IMM_MAT', titolo: 'Imm. Materiali', tipo: 'FOGLIA_MAPPABILE' },
  SP_IMM_IMM: { codice: 'SP_IMM_IMM', titolo: 'Imm. Immateriali', tipo: 'FOGLIA_MAPPABILE' },
  SP_IMM_FIN: { codice: 'SP_IMM_FIN', titolo: 'Imm. Finanziarie', tipo: 'FOGLIA_MAPPABILE' },
  SP_PASS_BREVE: { codice: 'SP_PASS_BREVE', titolo: 'Passivo Breve', tipo: 'FOGLIA_MAPPABILE' },
  SP_PASS_ML_TERM: {
    codice: 'SP_PASS_ML_TERM',
    titolo: 'Passivo M/L Termine',
    tipo: 'FOGLIA_MAPPABILE',
  },
  SP_CAP_SOCIALE: {
    codice: 'SP_CAP_SOCIALE',
    titolo: 'Capitale Sociale',
    tipo: 'FOGLIA_MAPPABILE',
  },
  SP_RISERVE: { codice: 'SP_RISERVE', titolo: 'Riserve', tipo: 'FOGLIA_MAPPABILE' },
  SP_UTILI_PREC: { codice: 'SP_UTILI_PREC', titolo: 'Utili Prec.', tipo: 'FOGLIA_MAPPABILE' },
  SP_UTILE_ESERCIZIO: {
    codice: 'SP_UTILE_ESERCIZIO',
    titolo: 'Utile Esercizio',
    tipo: 'FOGLIA_MAPPABILE',
  },
};

// --- COMPONENTE PRINCIPALE ---
export default function TabRiclassifica() {
  const [schemaSelezionato, setSchemaSelezionato] =
    useState<SchemaRiclassifica>('CE_VALORE_AGGIUNTO');
  const [filtroConti] = useState<FiltroConti>('TUTTI');
  const [ricercaTesto] = useState<string>('');
  const [contiOrigine] = useState<VoceContabileOrigine[]>([]);
  const [logErroriQuadratura] = useState<string[]>([]);

  // LOGICA CALCOLATA
  const getSommaVoce = (codice: string) => {
    if (!Array.isArray(contiOrigine)) return 0;
    return contiOrigine
      .filter((c) => c.categoriaDestinazione === codice)
      .reduce((sum, current) => sum + current.saldoOrigine, 0);
  };

  const contiFiltrati = useMemo(() => {
    if (!Array.isArray(contiOrigine)) return [];
    return contiOrigine.filter((c) => {
      const matchesRicerca =
        c.descrizione.toLowerCase().includes(ricercaTesto.toLowerCase()) ||
        c.codiceXbrl.includes(ricercaTesto);
      const corrispondeSchema =
        schemaSelezionato === 'CE_VALORE_AGGIUNTO'
          ? c.natura === 'C' || c.natura === 'R'
          : c.natura === 'A' || c.natura === 'P';

      if (!corrispondeSchema) return false;
      if (filtroConti === 'DA_MAPPARE') return !c.categoriaDestinazione && matchesRicerca;
      if (filtroConti === 'MAPPATI') return !!c.categoriaDestinazione && matchesRicerca;
      return matchesRicerca;
    });
  }, [contiOrigine, ricercaTesto, schemaSelezionato, filtroConti]);

  const opzioniSchema = useMemo(() => {
    const sorgente = schemaSelezionato === 'CE_VALORE_AGGIUNTO' ? SCHEMA_CE : SCHEMA_SP;
    const valori = Object.values(sorgente || {});
    return Array.isArray(valori) ? valori.filter((n) => n.tipo === 'FOGLIA_MAPPABILE') : [];
  }, [schemaSelezionato]);

  return (
    <div className="w-full bg-slate-50 p-6 rounded-xl border border-slate-200">
      {/* Visualizzazione Errori (Sicura) */}
      {Array.isArray(logErroriQuadratura) && logErroriQuadratura.length > 0 && (
        <div className="bg-rose-50 border-l-4 border-rose-600 p-4 mb-6">
          <ul className="text-xs text-rose-700 font-mono">
            {logErroriQuadratura.map((err, idx) => (
              <li key={idx}>• {err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            MOL / EBITDA
          </div>
          <div className="text-xl font-mono font-black mt-1 text-slate-900">
            € {getSommaVoce('CE_RICAVI').toLocaleString('it-IT', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Toggle Schema */}
      <div className="flex border-b border-slate-200 mb-4 gap-1">
        <button
          onClick={() => setSchemaSelezionato('CE_VALORE_AGGIUNTO')}
          className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-blue-600"
        >
          CE
        </button>
        <button
          onClick={() => setSchemaSelezionato('SP_FINANZIARIO')}
          className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-blue-600"
        >
          SP
        </button>
      </div>

      {/* Lista Conti */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {Array.isArray(contiFiltrati) &&
          contiFiltrati.map((conto) => (
            <div
              key={conto.id}
              className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between"
            >
              <div>
                <div className="text-xs font-bold font-mono text-blue-600">{conto.codiceXbrl}</div>
                <div className="text-xs text-slate-700">{conto.descrizione}</div>
              </div>
              <select
                value={conto.categoriaDestinazione || ''}
                className="text-[11px] border border-slate-300 rounded px-2 py-1"
              >
                <option value="">-- Seleziona --</option>
                {Array.isArray(opzioniSchema) &&
                  opzioniSchema.map((n) => (
                    <option key={n.codice} value={n.codice}>
                      {n.titolo}
                    </option>
                  ))}
              </select>
            </div>
          ))}
      </div>
    </div>
  );
}
